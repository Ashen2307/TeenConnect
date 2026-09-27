const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Database connected");
    }
});

/* =========================
   CREATE TABLES
========================= */

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Users table error:", err.message);
    } else {
        console.log("Users table ready");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        UNIQUE(sender, receiver)
    )
`, (err) => {
    if (err) {
        console.error("Friend requests table error:", err.message);
    } else {
        console.log("Friend requests table ready");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error("Private messages table error:", err.message);
    } else {
        console.log("Private messages table ready");
    }
});

/* =========================
   ONLINE USERS
========================= */

const connectedUsers = new Map();

function sendOnlineUsers() {
    io.emit(
        "online users",
        Array.from(connectedUsers.keys())
    );
}

/* =========================
   SERVER STATUS
========================= */

app.get("/api/status", (req, res) => {
    res.json({
        message: "TeenConnect server is working!"
    });
});

/* =========================
   REGISTER
========================= */

app.post("/api/register", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
        return res.json({
            success: false,
            message: "Username and password are required."
        });
    }

    db.run(
        `INSERT INTO users (username, password)
         VALUES (?, ?)`,
        [username.trim(), password],
        function(err) {

            if (err) {

                if (err.message.includes("UNIQUE")) {
                    return res.json({
                        success: false,
                        message: "Username already exists"
                    });
                }

                return res.json({
                    success: false,
                    message: "Registration failed."
                });
            }

            res.json({
                success: true,
                message: "Account created successfully!"
            });
        }
    );
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    db.get(
        `SELECT * FROM users
         WHERE username = ? AND password = ?`,
        [username, password],
        (err, user) => {

            if (err) {
                return res.json({
                    success: false,
                    message: "Login error."
                });
            }

            if (!user) {
                return res.json({
                    success: false,
                    message: "Invalid username or password."
                });
            }

            res.json({
                success: true,
                message: "Login successful!",
                username: user.username
            });
        }
    );
});

/* =========================
   GET USERS
========================= */

app.get("/api/users", (req, res) => {

    db.all(
        `SELECT id, username
         FROM users
         ORDER BY username`,
        [],
        (err, rows) => {

            if (err) {
                return res.json([]);
            }

            res.json(rows);
        }
    );
});

/* =========================
   FRIEND REQUEST
========================= */

app.post("/api/friend-request", (req, res) => {

    const sender = req.body.sender;
    const receiver = req.body.receiver;

    if (!sender || !receiver) {
        return res.json({
            success: false,
            message: "Missing sender or receiver."
        });
    }

    if (sender === receiver) {
        return res.json({
            success: false,
            message: "You cannot add yourself."
        });
    }

    db.get(
        `SELECT * FROM friend_requests
         WHERE sender = ?
         AND receiver = ?`,
        [sender, receiver],
        (err, existing) => {

            if (err) {
                return res.json({
                    success: false,
                    message: "Database error."
                });
            }

            if (existing) {

                if (existing.status === "accepted") {
                    return res.json({
                        success: false,
                        message: "You are already friends."
                    });
                }

                return res.json({
                    success: false,
                    message: "Friend request already exists."
                });
            }

            db.run(
                `INSERT INTO friend_requests
                 (sender, receiver, status)
                 VALUES (?, ?, 'pending')`,
                [sender, receiver],
                function(err) {

                    if (err) {
                        return res.json({
                            success: false,
                            message: "Could not send request."
                        });
                    }

                    /* Real-time notification */

                    const recipientSocket =
                        connectedUsers.get(receiver);

                    if (recipientSocket) {

                        io.to(recipientSocket).emit(
                            "friend request",
                            {
                                from: sender,
                                message:
                                    sender +
                                    " sent you a friend request!"
                            }
                        );
                    }

                    res.json({
                        success: true,
                        message: "Friend request sent!"
                    });
                }
            );
        }
    );
});

/* =========================
   GET FRIEND REQUESTS
========================= */

app.get("/api/friend-requests", (req, res) => {

    const username = req.query.username;

    db.all(
        `SELECT id, sender, receiver, status
         FROM friend_requests
         WHERE receiver = ?
         AND status = 'pending'`,
        [username],
        (err, rows) => {

            if (err) {
                return res.json([]);
            }

            res.json(rows);
        }
    );
});

/* =========================
   ACCEPT FRIEND REQUEST
========================= */

app.post("/api/friend-request/accept", (req, res) => {

    const id = req.body.id;

    db.get(
        `SELECT *
         FROM friend_requests
         WHERE id = ?`,
        [id],
        (err, request) => {

            if (err || !request) {
                return res.json({
                    success: false,
                    message: "Request not found."
                });
            }

            db.run(
                `UPDATE friend_requests
                 SET status = 'accepted'
                 WHERE id = ?`,
                [id],
                function(err) {

                    if (err) {
                        return res.json({
                            success: false,
                            message: "Could not accept request."
                        });
                    }

                    /* Notify sender */

                    const senderSocket =
                        connectedUsers.get(request.sender);

                    if (senderSocket) {

                        io.to(senderSocket).emit(
                            "friend request accepted",
                            {
                                from: request.receiver,
                                message:
                                    request.receiver +
                                    " accepted your friend request!"
                            }
                        );
                    }

                    res.json({
                        success: true,
                        message: "Friend request accepted."
                    });
                }
            );
        }
    );
});

/* =========================
   DECLINE FRIEND REQUEST
========================= */

app.post("/api/friend-request/decline", (req, res) => {

    const id = req.body.id;

    db.run(
        `DELETE FROM friend_requests
         WHERE id = ?`,
        [id],
        function(err) {

            if (err) {
                return res.json({
                    success: false,
                    message: "Could not decline request."
                });
            }

            res.json({
                success: true,
                message: "Friend request declined."
            });
        }
    );
});

/* =========================
   GET FRIENDS
========================= */

app.get("/api/friends", (req, res) => {

    const username = req.query.username;

    db.all(
        `SELECT sender AS friend
         FROM friend_requests
         WHERE receiver = ?
         AND status = 'accepted'

         UNION

         SELECT receiver AS friend
         FROM friend_requests
         WHERE sender = ?
         AND status = 'accepted'`,
        [username, username],
        (err, rows) => {

            if (err) {
                return res.json([]);
            }

            res.json(rows);
        }
    );
});

/* =========================
   PRIVATE MESSAGE HISTORY
========================= */

app.get("/api/private-messages", (req, res) => {

    const user1 = req.query.user1;
    const user2 = req.query.user2;

    db.all(
        `SELECT sender, receiver, message, created_at
         FROM private_messages
         WHERE
         (sender = ? AND receiver = ?)
         OR
         (sender = ? AND receiver = ?)
         ORDER BY id ASC`,
        [user1, user2, user2, user1],
        (err, rows) => {

            if (err) {
                return res.json([]);
            }

            res.json(rows);
        }
    );
});

/* =========================
   SOCKET.IO
========================= */

io.on("connection", (socket) => {

    console.log("A user connected");

    /* -------------------------
       REGISTER USER
    ------------------------- */

    socket.on("register user", (username) => {

        if (!username) return;

        const cleanUsername =
            username.trim();

        connectedUsers.set(
            cleanUsername,
            socket.id
        );

        console.log(
            cleanUsername +
            " is now ONLINE"
        );

        sendOnlineUsers();
    });

    /* -------------------------
       PUBLIC CHAT
    ------------------------- */

    socket.on("chat message", (data) => {

        if (!data) return;

        io.emit(
            "chat message",
            data
        );
    });

    /* -------------------------
       PRIVATE MESSAGE
    ------------------------- */

    socket.on("private message", (data) => {

        if (!data) return;

        const from = data.from;
        const to = data.to;
        const message =
            String(data.message || "").trim();

        if (!from || !to || !message) {
            return;
        }

        db.run(
            `INSERT INTO private_messages
             (sender, receiver, message)
             VALUES (?, ?, ?)`,
            [from, to, message],
            function(err) {

                if (err) {

                    socket.emit(
                        "private message error",
                        {
                            message:
                                "Message could not be saved."
                        }
                    );

                    return;
                }

                const recipientSocket =
                    connectedUsers.get(to);

                if (!recipientSocket) {

                    socket.emit(
                        "private message sent",
                        {
                            to: to,
                            message: message
                        }
                    );

                    socket.emit(
                        "private message error",
                        {
                            message:
                                to +
                                " is offline. Your message was saved."
                        }
                    );

                    return;
                }

                /* Send message */

                io.to(recipientSocket).emit(
                    "private message",
                    {
                        from: from,
                        to: to,
                        message: message
                    }
                );

                /* Tell sender message was sent */

                socket.emit(
                    "private message sent",
                    {
                        to: to,
                        message: message
                    }
                );

                /* New message notification */

                io.to(recipientSocket).emit(
                    "new private message",
                    {
                        from: from,
                        message:
                            from +
                            " sent you a new message!"
                    }
                );
            }
        );
    });

    /* -------------------------
       DISCONNECT
    ------------------------- */

    socket.on("disconnect", () => {

        for (
            const [username, socketId]
            of connectedUsers.entries()
        ) {

            if (socketId === socket.id) {

                connectedUsers.delete(username);

                console.log(
                    username +
                    " is now OFFLINE"
                );

                break;
            }
        }

        sendOnlineUsers();

        console.log("A user disconnected");
    });
});

/* =========================
   START SERVER
========================= */

server.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log(" TeenConnect is running!");
    console.log(" http://localhost:3000");
    console.log("=================================");
    console.log("");
});
(function () {

    const currentUsername =
        localStorage.getItem("username");

    let notificationLink =
        "/notifications.html";


    // =========================
    // NOTIFICATION POPUP HTML
    // =========================

    const popupHTML = `
        <div id="notificationPopup">

            <button
                id="closeNotificationButton"
                class="close-notification"
            >
                ✕
            </button>

            <h3 id="notificationTitle">
                🔔 New Notification
            </h3>

            <p id="notificationText">
                You have a new notification.
            </p>

            <button
                id="notificationViewButton"
                class="notification-button"
            >
                View
            </button>

        </div>
    `;


    // =========================
    // POPUP CSS
    // =========================

    const popupCSS = `
        #notificationPopup {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: white;
            border-radius: 14px;
            box-shadow: 0 6px 25px rgba(0,0,0,0.2);
            padding: 18px;
            z-index: 99999;
            display: none;
            border-left: 5px solid #6c4cff;
            animation: teenConnectPopup 0.3s ease;
        }

        #notificationPopup h3 {
            margin: 0 0 8px;
            color: #333;
        }

        #notificationPopup p {
            margin: 0 0 12px;
            color: #555;
        }

        .notification-button {
            background: #6c4cff;
            color: white;
            border: none;
            border-radius: 10px;
            padding: 10px 16px;
            font-weight: bold;
            cursor: pointer;
        }

        .notification-button:hover {
            opacity: 0.9;
        }

        .close-notification {
            position: absolute;
            right: 10px;
            top: 8px;
            border: none;
            background: none;
            color: #777;
            font-size: 18px;
            padding: 2px 6px;
            cursor: pointer;
        }

        @keyframes teenConnectPopup {

            from {
                opacity: 0;
                transform: translateX(30px);
            }

            to {
                opacity: 1;
                transform: translateX(0);
            }

        }

        @media (max-width: 600px) {

            #notificationPopup {
                width: calc(100% - 30px);
                right: 15px;
                top: 15px;
            }

        }
    `;


    // =========================
    // ADD CSS
    // =========================

    const style =
        document.createElement("style");

    style.textContent =
        popupCSS;

    document.head.appendChild(style);


    // =========================
    // ADD POPUP
    // =========================

    document.body.insertAdjacentHTML(
        "beforeend",
        popupHTML
    );


    // =========================
    // SOCKET.IO
    // =========================

    const notificationSocket =
        io();


    notificationSocket.emit(
        "register user",
        currentUsername
    );


    // =========================
    // SHOW NOTIFICATION
    // =========================

    function showNotification(
        title,
        text,
        link
    ) {

        const popup =
            document.getElementById(
                "notificationPopup"
            );

        const titleElement =
            document.getElementById(
                "notificationTitle"
            );

        const textElement =
            document.getElementById(
                "notificationText"
            );


        titleElement.textContent =
            title;

        textElement.textContent =
            text;

        notificationLink =
            link;

        popup.style.display =
            "block";


        clearTimeout(
            window.teenConnectNotificationTimer
        );


        window.teenConnectNotificationTimer =
            setTimeout(
                function () {

                    closeNotification();

                },
                7000
            );

    }


    // =========================
    // CLOSE
    // =========================

    function closeNotification() {

        const popup =
            document.getElementById(
                "notificationPopup"
            );

        popup.style.display =
            "none";

    }


    // =========================
    // VIEW BUTTON
    // =========================

    document
        .getElementById(
            "notificationViewButton"
        )
        .addEventListener(
            "click",
            function () {

                window.location.href =
                    notificationLink;

            }
        );


    // =========================
    // CLOSE BUTTON
    // =========================

    document
        .getElementById(
            "closeNotificationButton"
        )
        .addEventListener(
            "click",
            closeNotification
        );


    // =========================
    // SAVE NOTIFICATION
    // =========================

    function saveNotification(
        message,
        link
    ) {

        if (!currentUsername) {
            return;
        }


        const key =
            "notifications_" +
            currentUsername;


        let notifications =
            JSON.parse(
                localStorage.getItem(key) ||
                "[]"
            );


        notifications.unshift({

            message:
                message,

            link:
                link,

            time:
                new Date().toLocaleString(),

            read:
                false

        });


        notifications =
            notifications.slice(
                0,
                50
            );


        localStorage.setItem(
            key,
            JSON.stringify(
                notifications
            )
        );

    }


    // =========================
    // FRIEND REQUEST
    // =========================

    notificationSocket.on(
        "friend request",
        function (data) {

            if (
                data.receiver !==
                currentUsername
            ) {
                return;
            }


            const sender =
                data.from ||
                data.sender ||
                "Someone";


            const message =
                data.message ||
                sender +
                " sent you a friend request.";


            showNotification(
                "👋 New Friend Request",
                message,
                "/friends.html"
            );


            saveNotification(
                message,
                "/friends.html"
            );

        }
    );


    // =========================
    // FRIEND REQUEST ACCEPTED
    // =========================

    notificationSocket.on(
        "friend request accepted",
        function (data) {

            if (
                data.receiver !==
                currentUsername
            ) {
                return;
            }


            const sender =
                data.from ||
                data.sender ||
                "Someone";


            const message =
                data.message ||
                sender +
                " accepted your friend request.";


            showNotification(
                "✅ Friend Request Accepted",
                message,
                "/friends.html"
            );


            saveNotification(
                message,
                "/friends.html"
            );

        }
    );


    // =========================
    // PRIVATE MESSAGE
    // =========================

    notificationSocket.on(
        "new private message",
        function (data) {

            if (
                data.receiver !==
                currentUsername
            ) {
                return;
            }


            const sender =
                data.from ||
                data.sender ||
                "Someone";


            const message =
                sender +
                " sent you a private message.";


            const link =
                "/private-chat.html?username=" +
                encodeURIComponent(
                    sender
                );


            showNotification(
                "💬 New Private Message",
                message,
                link
            );


            saveNotification(
                message,
                link
            );

        }
    );

})();
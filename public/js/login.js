var url = document.URL.substr(0, document.URL.lastIndexOf("/"));
var urlSplit = url.split("/");
var subdir = "";
for (var i = 3; i < urlSplit.length; i++) {
    subdir = subdir + "/" + urlSplit[i];
}

// once page is loaded
$(document).ready(function() {
    let authInfo = Cookies.getJSON("whiteboard-auth");
    if (authInfo) {
        $("#username").attr("value", authInfo.username);
        $("#uuid").attr("value", authInfo.uuid);
        //$("#uuid").prop("disabled", true);
    }

    $("#login").click(function() {
        attemptLogin($("#username").val(), $("#uuid").val());
    });

    let gmUsername = "game-master";

    $.ajax({
        type: "POST",
        dataType: "json",
        url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/user",
        data: {
            "username": gmUsername,
            "request": "gm-available"
        },
        success: function(msg) {
            console.log(msg);
            if (msg["response"] == "available") {
                $("#game-master").prop("disabled", false);
                $("#game-master").click(function() {
                    attemptLogin(gmUsername, "");
                });
                console.log("gm available");
            }
            else {
                console.log("gm unavailable");
            }
        },
        error: function() {
            console.error("unknown error while checking dm availability");
        }
    });
});

function handleLoginResult(result) {
    switch (result["response"]) {
        case "no-user-given":
            window.alert("no name given");
            break;
        case "already-exists":
            window.alert("name already taken");
            break;
        case "new-user":
            console.log("new user created");
            Cookies.set("whiteboard-auth", {
                username: result["username"],
                uuid: result["uuid"]
            }, {
                expires: 1
            });
            window.location.replace("/whiteboard.html");
            break;
        case "no-uuid-given":
            window.alert("no uuid given");
            break;
        case "no-such-user":
            console.error("unknown uuid, tring to create new account");
            $("#uuid").val("");
            attemptLogin($("#username").val(), $("#uuid").val());
            break;
        case "auth-success":
            console.log("authentication success");
            Cookies.set("whiteboard-auth", {
                username: result["username"],
                uuid: result["uuid"]
            }, {
                expires: 1
            });
            window.location.replace("/whiteboard.html");
            break;
    }
}

function attemptLogin(username, uuid) {
    if (!username && !uuid) {
        window.alert("no input");
        console.error("no input");
        return;
    }

    let request = "";
    if (uuid) {
        request = "auth";
    }
    else if (username) {
        request = "new-user";
    }

    $.ajax({
        type: "POST",
        dataType: "json",
        url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/user",
        data: {
            "username": username,
            "uuid": uuid,
            "request": request
        },
        success: function(msg) {
            handleLoginResult(msg);
        },
        error: function() {
            window.alert("unknown error");
            console.error("unknown error");
        }
    });
}
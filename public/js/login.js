var url = document.URL.substr(0, document.URL.lastIndexOf("/"));
var urlSplit = url.split("/");
var subdir = "";
for (var i = 3; i < urlSplit.length; i++) {
    subdir = subdir + "/" + urlSplit[i];
}

// once page is loaded
$(document).ready(function() {
    if (Cookies.get("whiteboard-username")) {
        $("#username").val(Cookies.get("whiteboard-username"));

    }
    if (Cookies.get("whiteboard-uuid")) {
        $("#uuid").val(Cookies.get("whiteboard-uuid"));
        $("#uuid").prop("disabled", true);
    }

    $("#login").click(function() {
        attemptLogin($("#username").val(), $("#uuid").val());
    });
});

function handleLoginResult(result) {
    switch (result["response"]) {
        case "no-user-given":
            window.alert("no name given");
            console.error("no name given");
            break;
        case "already-exists":
            window.alert("name already taken");
            console.error("name already taken");
            break;
        case "new-user":
            console.log("new user created");
            Cookies.set("whiteboard-username", result["username"]);
            Cookies.set("whiteboard-uuid", result["uuid"]);
            window.location.replace("/whiteboard.html");
            break;
        case "no-uuid-given":
            window.alert("no uuid given");
            console.error("no uuid given");
            break;
        case "no-such-user":
            console.error("unknown uuid, tring to create new account");
            $("#uuid").val("");
            attemptLogin($("#username").val(), $("#uuid").val());
            break;
        case "auth-success":
            console.log("authentication success");
            Cookies.set("whiteboard-username", result["username"]);
            Cookies.set("whiteboard-uuid", result["uuid"]);
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
//This file is only for saving the whiteboard. (Not to a file, only to RAM atm. Whiteboard is gone after server restart)

var uuidv4 = require("uuid/v4");

var savedBoards = {};
var users = {};
var uuids = {};

module.exports = {
    // handle user changes to board
    handleUserAction: function(content) {
        // determine used tool
        var tool = content["t"];

        // determine whiteboard ID
        var whiteBoardID = content["wid"];

        // get username
        var username = content["username"];

        var allowed_tools = ["line", "pen", "rect", "circle", "eraser", "addImgBG", "recSelect", "eraseRec"];

        // clear the whiteboard
        if (tool === "clear") {
            delete savedBoards[whiteBoardID];
        }
        // undo an action
        else if (tool === "undo") {
            if (!savedBoards[whiteBoardID]) {
                return;
            }

            var drawId = content.i;

            // find last drawn item id if necessary
            if (drawId == -1) {
                var lastIndexOfUser = -1;
                for (var i = savedBoards[whiteBoardID].length - 1; i >= 0; i--) {
                    if (savedBoards[whiteBoardID][i].username == username) {
                        lastIndexOfUser = i;
                        break;
                    }
                }

                // skip request if the user has no recorded action
                if (lastIndexOfUser == -1) {
                    return;
                }

                drawId = savedBoards[whiteBoardID][lastIndexOfUser]["drawId"];
            }

            // remove elements
            for (i = savedBoards[whiteBoardID].length - 1; i >= 0; i--) {
                if (savedBoards[whiteBoardID][i]["drawId"] == drawId && savedBoards[whiteBoardID][i]["username"] == username) {
                    savedBoards[whiteBoardID].splice(i, 1);
                }
            }
        }
        // save new action
        else if (allowed_tools.includes(tool)) {
            if (!savedBoards[whiteBoardID]) {
                savedBoards[whiteBoardID] = [];
            }
            // delete whiteboard id because we already have it
            delete content["wid"];
            savedBoards[whiteBoardID].push(content);
        }
    },
    // load a saved board
    loadStoredData: function(whiteBoardID) {
        // return empty board if it doesn't exist
        if (!savedBoards[whiteBoardID]) {
            return [];
        }
        return savedBoards[whiteBoardID];
    },

    haveUser: function(username) {
        if (users.hasOwnProperty(username)) {
            return true;
        }
        return false;
    },
    newUser: function(username) {
        if (this.haveUser(username)) {
            return null;
        }

        // generate new UUID
        let uuid = uuidv4();

        // create local references
        users[username] = {};
        users[username].uuid = uuid;
        users[username].username = username;

        uuids[uuid] = username;

        return uuid;
    },
    getUser: function(uuid) {
        if (!uuids[uuid]) {
            return null;
        }
        return users[uuids[uuid]];
    }
};
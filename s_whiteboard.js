//This file is only for saving the whiteboard. (Not to a file, only to RAM atm. Whiteboard is gone after server restart)

var savedBoards = {};
module.exports = {
    handleEventsAndData: function (content) {
        // determine used tool
        var tool = content["t"];

        // determine whiteboard ID
        var whiteBoardID = content["wid"];

        // get username
        var username = content["username"];

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
        else if (tool === "line" || tool === "pen" || tool === "rect" || tool === "circle" || tool === "eraser" || tool === "addImgBG" || tool === "recSelect" || tool === "eraseRec") {
            if (!savedBoards[whiteBoardID]) {
                savedBoards[whiteBoardID] = [];
            }
            delete content["wid"]; //Delete id from content so we don't store it twice
            savedBoards[whiteBoardID].push(content);
        }
    },
    // load a saved board
    loadStoredData: function (whiteBoardID) {
        // return empty board if it doesn't exist
        if (!savedBoards[whiteBoardID]) {
            return [];
        }
        return savedBoards[whiteBoardID];
    }
}
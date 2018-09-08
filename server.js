var PORT = 8080; //Set port for the app

fs = require("fs-extra");
var express = require('express');
var formidable = require('formidable'); //form upload processing
var whiteboard_storage = require("./whiteboard_storage.js");

var app = express();
app.use(express.static(__dirname + '/public'));
var server = require('http').Server(app);
server.listen(PORT);
var io = require('socket.io')(server);
console.log("Webserver & socketserver running on port:" + PORT);

app.get('/loadwhiteboard', function (request, response) {
    var wid = request["query"]["wid"];
    var board = whiteboard_storage.loadStoredData(wid);
    response.send(board);
    response.end();
});

app.post('/upload', function (req, res) { //File upload
    var form = new formidable.IncomingForm(); //Receive form
    var formData = {
        files: {},
        fields: {}
    }

    form.on('file', function (name, file) {
        formData["files"][file.name] = file;
    });

    form.on('field', function (name, value) {
        formData["fields"][name] = value;
    });

    form.on('error', function (err) {
        console.log('File uplaod error!');
    });

    form.on('end', function () {
        progressUploadFormData(formData);
        res.send("done");
        //End file upload
    });
    form.parse(req);
});

// process uploaded file
function progressUploadFormData(formData) {
    var fields = formData.fields;
    var files = formData.files;
    var whiteboardId = fields["whiteboardId"];

    // determine metadata
    var name = fields["name"] || "";
    var date = fields["date"] || (+new Date());
    var extension = imagedata.match(/^data:image\/([^;]+)/)[1];
    var filename = whiteboardId + "_" + date + "." + extension";

    // save file locally
    fs.ensureDir("./public/uploads", function (err) {
        var imagedata = fields["imagedata"];
        
        if (imagedata && imagedata != "") {
            // store image using base64 data
            imagedata = imagedata.replace(/^data:image\/[^;]+;base64,/, "");
            console.log("storing", filename);
            fs.writeFile('./public/uploads/' + filename, imagedata, 'base64', function (err) {
                if (err) {
                    console.log("error ", err);
                }
            });
        }
    });
}

var allUsers = {};

// handle client connections
io.on('connection', function (socket) {
        // new member
    socket.on('joinWhiteboard', function (wid) {
        allUsers[socket.id] = {
            "socket": socket,
            "wid": wid
        };
    });
    
    // generally any action related to drawing from users
    socket.on('drawToWhiteboard', function (content) {
        content = escapeAllContentStrings(content);
        // send changes to members on same whiteboard
        sendToAllUsersOfWhiteboard(content["wid"], socket.id, content);
        // send changes to storage
        whiteboard_storage.handleEventsAndData(content);
    });
    
    // one member less
    socket.on('disconnect', function () {
        delete allUsers[socket.id];
        socket.broadcast.emit('refreshUserBadges', null);
    });
});

function sendToAllUsersOfWhiteboard(whiteboardId, ownSocketId, content) {
    for (var i in allUsers) {
        if (allUsers[i]["wid"] === whiteboardId && allUsers[i]["socket"].id !== ownSocketId) {
            allUsers[i]["socket"].emit('drawToWhiteboard', content);
        }
    }
}

//Prevent cross site scripting
function escapeAllContentStrings(content, cnt) {
    if (!cnt)
        cnt = 0;

    if (typeof (content) == "string") {
        return content.replace(/<\/?[^>]+(>|$)/g, "");
    }
    for (var i in content) {
        if (typeof (content[i]) == "string") {
            content[i] = content[i].replace(/<\/?[^>]+(>|$)/g, "");
        }
        if (typeof (content[i]) == "object" && cnt < 10) {
            content[i] = escapeAllContentStrings(content[i], ++cnt);
        }
    }
    return content;
}
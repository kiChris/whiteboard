let whiteboard = {
    // canvas element
    canvas: null,
    // 2d drawing context
    context: null,
    // current drawing color
    drawcolor: "black",
    // current drawing tool
    tool: "pen",
    // current shape thiccnesss
    thickness: 4,
    // cursor position on previous event
    previousCoords: {
        x: 0,
        y: 0
    },
    // flag determining if the user is currently drawing
    drawFlag: false,
    // previous canvas drawing mode (TODO)
    oldGCO: null,
    // flag if mouse is currently over canvas
    mouseover: false,
    // determines wether shapes should be rounded
    lineCap: "round", //butt, square
    // HTML elements
    elements: {
        // background grid
        backgroundGrid: null,
        // canvas
        canvas: null,
        // cursor container
        cursorContainer: null,
        // background images container
        imgContainer: null,
        // svg containing previews
        svgContainer: null,
        // mouse overlay (TODO)
        mouseOverlay: null,
        // own cursor highlighter
        ownCursor: null,
    },
    // buffer containing individual draw steps
    drawBuffer: [],
    // current active draw id for this user
    drawId: 0,
    // bounding boxes for images
    imageBoxes: [],
    // flag if user is currently dragging an image preview
    imgDragActive: false,
    // current session settings
    settings: {
        whiteboardId: "0",
        username: "unknown",
        sendFunction: null,
        canvasWidth: 2000,
        canvasHeight: 2000,
        backgroundGridUrl: "./img/KtEBa2.png"
    },
    // set-up (constructor)
    loadWhiteboard: function(whiteboardContainer, newSettings) {
        let svgns = "http://www.w3.org/2000/svg";
        let _this = this;
        for (let x in this.newSettings) {
            this.settings[x] = newSettings[x];
        }
        this.settings.username = this.settings.username.replace(/[^0-9a-z]/gi, "");
        this.settings.whiteboardId = this.settings.whiteboardId.replace(/[^0-9a-z]/gi, "");

        let startCoords = [];
        let svgLine = null;
        let svgRect = null;
        let svgCirle = null;
        let latestTouchCoords = {
            x: 0,
            y: 0
        };


        // background grid (repeating image)
        _this.elements.backgroundGrid = $("<div id=\"background-grid\" class=\"top-left fill\" style=\"background-image:url('" + _this.settings["backgroundGridUrl"] + "');\"></div>");
        // container for background images
        _this.elements.imgContainer = $("<div id=\"background-container\" class=\"top-left fill\"></div>");
        // whiteboard canvas
        _this.elements.canvas = $("<canvas id=\"whiteboard-canvas\" class=\"top-left\"></canvas>");
        // SVG container holding drawing or moving previews
        _this.elements.svgContainer = $("<svg id=\"preview-container\" class=\"top-left\" width=\"" + _this.settings.canvasWidth + "\" height=\"" + _this.settings.canvasHeight + "\"></svg>");
        // container for cursors of other users
        _this.elements.cursorContainer = $("<div id=\"cursor-container\" class=\"top-left fill\"></div>");
        // drag and drop display, hidden by default
        _this.dropIndicator = $("<div id=\"drag-and-drop\" class=\"top-left fill\" style=\"display:none\"><i class=\"far fa-plus-square\" aria-hidden=\"true\"></i></div>");
        // mouse overlay for callbacks
        _this.elements.mouseOverlay = $("<div id=\"mouse-overlay\" class=\"top-left fill\"></div>");

        // add elements to div containing all whiteboard stuff
        $(whiteboardContainer).append(_this.elements.backgroundGrid)
            .append(_this.elements.imgContainer)
            .append(_this.elements.canvas)
            .append(_this.elements.svgContainer)
            .append(_this.dropIndicator)
            .append(_this.elements.cursorContainer)
            .append(_this.elements.mouseOverlay);

        // set up canvas references
        this.canvas = $("#whiteboard-canvas")[0];
        this.canvas.height = _this.settings.canvasHeight;
        this.canvas.width = _this.settings.canvasWidth;
        this.context = this.canvas.getContext("2d");
        this.oldGCO = this.context.globalCompositeOperation;

        // set currect settings for current/default tool
        _this.setTool(_this.tool);

        // on mouse click
        $(_this.elements.mouseOverlay).on("mousedown touchstart", function(e) {
            if (_this.imgDragActive) {
                return;
            }
            _this.drawFlag = true;

            // mouse X & Y
            _this.previousCoords = {
                x: (e.offsetX || e.pageX - $(e.target).offset().left),
                y: (e.offsetY || e.pageY - $(e.target).offset().top)
            };

            // if on touchscreen, touch X & Y
            if (!_this.previousCoords.x || !_this.previousCoords.y) {
                let touche = e.touches[0];
                _this.previousCoords.x = touche.clientX - $(_this.elements.mouseOverlay).offset().left;
                _this.previousCoords.y = touche.clientY - $(_this.elements.mouseOverlay).offset().top;
                latestTouchCoords = _this.previousCoords;
            }

            // do tool-appropriate steps
            if (_this.tool === "pen") {
                // draw line segment
                _this.drawPenLine(_this.previousCoords.x, _this.previousCoords.y, _this.previousCoords.x, _this.previousCoords.y, _this.drawcolor, _this.thickness);
                _this.sendFunction({
                    "t": _this.tool,
                    "d": [_this.previousCoords.x, _this.previousCoords.y, _this.previousCoords.x, _this.previousCoords.y],
                    "c": _this.drawcolor,
                    "th": _this.thickness
                });
            }
            else if (_this.tool === "moveImage") {
                // "raytrace" backwards through image bounding boxes to find hit
                for (let i = _this.imageBoxes.length - 1; i >= 0; i--) {
                    if (_this.previousCoords.x < _this.imageBoxes[i].right &&
                        _this.previousCoords.x >= _this.imageBoxes[i].left &&
                        _this.previousCoords.y < _this.imageBoxes[i].bottom &&
                        _this.previousCoords.y >= _this.imageBoxes[i].top) {

                        // "undo" old image, add new one
                        _this.undoWhiteboardClick(_this.imageBoxes[i].drawId);
                        let width = _this.imageBoxes[i].right - _this.imageBoxes[i].left;
                        let height = _this.imageBoxes[i].bottom - _this.imageBoxes[i].top;
                        _this.addImgToCanvasByUrl(_this.imageBoxes[i].url, _this.imageBoxes[i].left, _this.imageBoxes[i].top, width, height);

                        // delete bounding box
                        _this.imageBoxes.splice(i, 1);

                        break;
                    }
                }
            }
            else if (_this.tool === "eraser") {
                // draw eraser line
                _this.drawEraserLine(_this.previousCoords.x, _this.previousCoords.y, _this.previousCoords.x, _this.previousCoords.y, _this.thickness);
                _this.sendFunction({
                    "t": _this.tool,
                    "d": [_this.previousCoords.x, _this.previousCoords.y, _this.previousCoords.x, _this.previousCoords.y],
                    "th": _this.thickness
                });
            }
            else if (_this.tool === "line") {
                // draw straight line
                startCoords = [_this.previousCoords.x, _this.previousCoords.y];
                svgLine = document.createElementNS(svgns, "line");
                svgLine.setAttribute("stroke", "gray");
                svgLine.setAttribute("stroke-dasharray", "5, 5");
                svgLine.setAttribute("x1", _this.previousCoords.x);
                svgLine.setAttribute("y1", _this.previousCoords.y);
                svgLine.setAttribute("x2", _this.previousCoords.x + 1);
                svgLine.setAttribute("y2", _this.previousCoords.y + 1);
                _this.elements.svgContainer.append(svgLine);
            }
            else if (_this.tool === "rect" || _this.tool === "recSelect") {
                // draw preview rectangle to svg container
                _this.elements.svgContainer.find("rect").remove();
                svgRect = document.createElementNS(svgns, "rect");
                svgRect.setAttribute("stroke", "gray");
                svgRect.setAttribute("stroke-dasharray", "5, 5");
                svgRect.setAttribute("style", "fill-opacity:0.0;");
                svgRect.setAttribute("x", _this.previousCoords.x);
                svgRect.setAttribute("y", _this.previousCoords.y);
                svgRect.setAttribute("width", 0);
                svgRect.setAttribute("height", 0);
                _this.elements.svgContainer.append(svgRect);
                startCoords = [_this.previousCoords.x, _this.previousCoords.y];
            }
            else if (_this.tool === "circle") {
                // draw circle preview to svg container
                svgCirle = document.createElementNS(svgns, "circle");
                svgCirle.setAttribute("stroke", "gray");
                svgCirle.setAttribute("stroke-dasharray", "5, 5");
                svgCirle.setAttribute("style", "fill-opacity:0.0;");
                svgCirle.setAttribute("cx", _this.previousCoords.x);
                svgCirle.setAttribute("cy", _this.previousCoords.y);
                svgCirle.setAttribute("r", 0);
                _this.elements.svgContainer.append(svgCirle);
                startCoords = [_this.previousCoords.x, _this.previousCoords.y];
            }
        });

        // on mouse movement
        $(_this.elements.mouseOverlay).on("mousemove touchmove", function(e) {
            e.preventDefault();
            // skip if an image is being dragged
            if (_this.imgDragActive) {
                return;
            }

            // cursor position
            let currentCoords = {
                x: (e.offsetX || e.pageX - $(e.target).offset().left),
                y: (e.offsetY || e.pageY - $(e.target).offset().top)
            };

            window.requestAnimationFrame(function() {
                if ((!currentCoords.x || !currentCoords.y) && e.touches && e.touches[0]) {
                    let touche = e.touches[0];
                    currentCoords.x = touche.clientX - $(_this.elements.mouseOverlay).offset().left;
                    currentCoords.y = touche.clientY - $(_this.elements.mouseOverlay).offset().top;
                    latestTouchCoords = currentCoords;
                }

                if (_this.drawFlag) {
                    if (_this.tool === "pen") {
                        // draw next line segment
                        _this.drawPenLine(currentCoords.x, currentCoords.y, _this.previousCoords.x, _this.previousCoords.y, _this.drawcolor, _this.thickness);
                        _this.sendFunction({
                            "t": _this.tool,
                            "d": [currentCoords.x, currentCoords.y, _this.previousCoords.x, _this.previousCoords.y],
                            "c": _this.drawcolor,
                            "th": _this.thickness
                        });
                    }
                    else if (_this.tool == "eraser") {
                        // draw next eraser line segment
                        _this.drawEraserLine(currentCoords.x, currentCoords.y, _this.previousCoords.x, _this.previousCoords.y, _this.thickness);
                        _this.sendFunction({
                            "t": _this.tool,
                            "d": [currentCoords.x, currentCoords.y, _this.previousCoords.x, _this.previousCoords.y],
                            "th": _this.thickness
                        });
                    }
                    _this.previousCoords = currentCoords;
                }

                if (_this.tool === "eraser") {
                    let left = currentCoords.x - _this.thickness;
                    let top = currentCoords.y - _this.thickness;
                    if (_this.elements.ownCursor) {
                        _this.elements.ownCursor.css({
                            "top": top + "px",
                            "left": left + "px"
                        });
                    }
                }
                else if (_this.tool === "pen") {
                    let left = currentCoords.x - _this.thickness / 2;
                    let top = currentCoords.y - _this.thickness / 2;
                    if (_this.elements.ownCursor) {
                        _this.elements.ownCursor.css({
                            "top": top + "px",
                            "left": left + "px"
                        });
                    }
                }
                else if (_this.tool === "line") {
                    if (svgLine) {
                        // round angles if shift is held
                        if (pressed.shift) {
                            let angs = getRoundedAngles(currentCoords.x, currentCoords.y);
                            currentCoords.x = angs.x;
                            currentCoords.y = angs.y;
                        }
                        svgLine.setAttribute("x2", currentCoords.x);
                        svgLine.setAttribute("y2", currentCoords.y);
                    }
                }
                else if (_this.tool === "rect" || (_this.tool === "recSelect" && _this.drawFlag)) {
                    if (svgRect) {
                        let width = Math.abs(currentCoords.x - startCoords[0]);
                        let height = Math.abs(currentCoords.y - startCoords[1]);
                        if (pressed.shift) {
                            height = width;
                            let x = currentCoords.x < startCoords[0] ? startCoords[0] - width : startCoords[0];
                            let y = currentCoords.y < startCoords[1] ? startCoords[1] - width : startCoords[1];
                            svgRect.setAttribute("x", x);
                            svgRect.setAttribute("y", y);
                        }
                        else {
                            let x = currentCoords.x < startCoords[0] ? currentCoords.x : startCoords[0];
                            let y = currentCoords.y < startCoords[1] ? currentCoords.y : startCoords[1];
                            svgRect.setAttribute("x", x);
                            svgRect.setAttribute("y", y);
                        }

                        svgRect.setAttribute("width", width);
                        svgRect.setAttribute("height", height);
                    }
                }
                else if (_this.tool === "circle") {
                    let a = currentCoords.x - startCoords[0];
                    let b = currentCoords.y - startCoords[1];
                    let radius = Math.sqrt(a * a + b * b);
                    if (svgCirle) {
                        svgCirle.setAttribute("r", radius);
                    }
                }
            });
            _this.sendFunction({
                "t": "cursor",
                "event": "move",
                "d": [currentCoords.x, currentCoords.y],
                "username": _this.settings.username
            });
        });

        // on mouse release
        $(_this.elements.mouseOverlay).on("mouseup touchend touchcancel", function(e) {
            if (_this.imgDragActive) {
                return;
            }
            _this.drawFlag = false;
            _this.drawId++;
            _this.context.globalCompositeOperation = _this.oldGCO;
            let currX = (e.offsetX || e.pageX - $(e.target).offset().left);
            let currY = (e.offsetY || e.pageY - $(e.target).offset().top);
            if ((!currX || !currY) && e.touches[0]) {
                currX = latestTouchCoords.x;
                currY = latestTouchCoords.y;
                _this.sendFunction({
                    "t": "cursor",
                    "event": "out",
                    "username": _this.settings.username
                });
            }

            if (_this.tool === "line") {
                if (pressed.shift) {
                    let angs = getRoundedAngles(currX, currY);
                    currX = angs.x;
                    currY = angs.y;
                }
                _this.drawPenLine(currX, currY, startCoords[0], startCoords[1], _this.drawcolor, _this.thickness);
                _this.sendFunction({
                    "t": _this.tool,
                    "d": [currX, currY, startCoords[0], startCoords[1]],
                    "c": _this.drawcolor,
                    "th": _this.thickness
                });
                _this.elements.svgContainer.find("line").remove();
            }
            else if (_this.tool === "rect") {
                if (pressed.shift) {
                    if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
                        currY = startCoords[1] + (currX - startCoords[0]);
                    }
                    else {
                        currY = startCoords[1] - (currX - startCoords[0]);
                    }
                }
                _this.drawRec(startCoords[0], startCoords[1], currX, currY, _this.drawcolor, _this.thickness);
                _this.sendFunction({
                    "t": _this.tool,
                    "d": [startCoords[0], startCoords[1], currX, currY],
                    "c": _this.drawcolor,
                    "th": _this.thickness
                });
                _this.elements.svgContainer.find("rect").remove();
            }
            else if (_this.tool === "circle") {
                let a = currX - startCoords[0];
                let b = currY - startCoords[1];
                let r = Math.sqrt(a * a + b * b);
                _this.drawCircle(startCoords[0], startCoords[1], r, _this.drawcolor, _this.thickness);
                _this.sendFunction({
                    "t": _this.tool,
                    "d": [startCoords[0], startCoords[1], r],
                    "c": _this.drawcolor,
                    "th": _this.thickness
                });
                _this.elements.svgContainer.find("circle").remove();
            }
            else if (_this.tool === "recSelect") {
                _this.imgDragActive = true;
                if (pressed.shift) {
                    if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
                        currY = startCoords[1] + (currX - startCoords[0]);
                    }
                    else {
                        currY = startCoords[1] - (currX - startCoords[0]);
                    }
                }

                let width = Math.abs(startCoords[0] - currX);
                let height = Math.abs(startCoords[1] - currY);
                let left = startCoords[0] < currX ? startCoords[0] : currX;
                let top = startCoords[1] < currY ? startCoords[1] : currY;

                let widthTag = ";width:" + width + "px";
                let heightTag = ";height:" + height + "px";

                _this.elements.mouseOverlay.css({
                    "cursor": "default"
                });
                let imgDiv = $("<div class=\"image-mover\" style=\"left:" + (left - 2) + "px; top:" + (top - 2) + "px" + widthTag + heightTag + ";overflow: hidden;border: 2px dotted gray\">" +
                    "<canvas class=\"fill\" style=\"cursor:move; \" width=\"" + width + "\" height=\"" + height + "\"/>" +
                    "<div class=\"img-mover-btns\">" +
                    "<button class=\"js-add-btn img-mover-btn\"><i class=\"fas fa-check\"></i></button>" +
                    //"<button class=\"js-delete-btn img-mover-btn\"><i class=\"fas fa-trash-alt\"></i></button>" +
                    "<button class=\"js-close-btn img-mover-btn\"><i class=\"fas fa-times\"></i></button>" +
                    "</div>" +
                    "</div>");
                let dragCanvas = $(imgDiv).find("canvas");
                let dragOutOverlay = $("<div class=\"dragOutOverlay\" style=\"position:absolute; left:" + left + "px; top:" + top + "px; width:" + width + "px; height:" + height + "px; background:white;\"></div>");
                _this.elements.mouseOverlay.append(dragOutOverlay);
                _this.elements.mouseOverlay.append(imgDiv);


                let destCanvasContext = dragCanvas[0].getContext("2d");
                destCanvasContext.drawImage(_this.canvas, left, top, width, height, 0, 0, width, height);

                imgDiv.find(".js-close-btn").click(function() {
                    // draw rectangle contents
                    _this.imgDragActive = false;
                    _this.setToolCursor(_this.tool);
                    imgDiv.remove();
                    dragOutOverlay.remove();
                });
                imgDiv.find(".js-delete-btn").click(function() {
                    _this.imgDragActive = false;
                    _this.setToolCursor(_this.tool);
                    imgDiv.remove();
                    dragOutOverlay.remove();

                    // TODO: implement drawing a filled rectangle
                    //_this.eraseRec(left, top, width, height);
                    /*_this.drawRec(startCoords[0], startCoords[1], currX, currY, _this.drawcolor, _this.thickness);
                    _this.sendFunction({
                        "t": _this.tool,
                        "d": [startCoords[0], startCoords[1], currX, currY],
                        "c": _this.drawcolor,
                        "th": _this.thickness
                    });*/
                });
                imgDiv.find(".js-add-btn").click(function() {
                    // draw rectangle contents
                    _this.imgDragActive = false;
                    _this.setToolCursor(_this.tool);

                    let p = imgDiv.position();
                    // + 2 to adjust for border
                    let leftT = Math.round(p.left * 100) / 100 + 2;
                    let topT = Math.round(p.top * 100) / 100 + 2;
                    //xf, yf, xt, yt, width, height
                    _this.drawId++;
                    _this.sendFunction({
                        "t": _this.tool,
                        "d": [left, top, leftT, topT, width, height]
                    });
                    _this.dragCanvasRectContent(left, top, leftT, topT, width, height);
                    imgDiv.remove();
                    dragOutOverlay.remove();
                });
                imgDiv.draggable();
                _this.elements.svgContainer.find("rect").remove();
            }
        });

        // on moving the mouse out the window
        $(_this.elements.mouseOverlay).on("mouseout", function() {
            if (_this.imgDragActive) {
                return;
            }
            _this.drawFlag = false;
            _this.mouseover = false;
            _this.context.globalCompositeOperation = _this.oldGCO;
            _this.setToolCursor("default");
            _this.elements.svgContainer.find("line").remove();
            _this.elements.svgContainer.find("rect").remove();
            _this.elements.svgContainer.find("circle").remove();
            _this.sendFunction({
                "t": "cursor",
                "event": "out"
            });
        });

        // on moving the mouse into the window
        $(_this.elements.mouseOverlay).on("mouseover", function() {
            if (_this.imgDragActive) {
                return;
            }
            if (!_this.mouseover) {
                _this.setToolCursor(_this.tool);
            }
            _this.mouseover = true;
        });

        // key states
        let pressed = {
            ctrl: false,
            z: false,
            shift: false
        };

        // on key pressed
        $(document).on("keydown", function(e) {
            // control
            if (e.which == 17) {
                pressed.ctrl = true;
            }
            // z
            // TODO: localize for americans and their weird ctrly
            else if (e.which == 90) {
                if (pressed.ctrl && !pressed.z) {
                    _this.undoWhiteboardClick();
                }
                pressed.z = true;
            }
            // shift
            else if (e.which == 16) {
                pressed.shift = true;
            }
            // escape
            else if (e.which == 27) {
                if (!_this.drawFlag) {
                    _this.elements.svgContainer.empty();
                }
                // close all movers
                _this.elements.mouseOverlay.find(".js-close-btn").click();
            }
        });

        // on key released
        $(document).on("keyup", function(e) {
            if (e.which == 17) {
                pressed.ctrl = false;
            }
            else if (e.which == 90) {
                pressed.z = false;
            }
            else if (e.which == 16) {
                pressed.shift = false;
            }
        });

        // helper function to round angles to nearest multiple of 45°
        function getRoundedAngles(currX, currY) {
            let x = currX - startCoords[0];
            let y = currY - startCoords[1];
            let angle = Math.atan2(x, y) * (180 / Math.PI);
            let angle45 = Math.round(angle / 45) * 45;
            if (angle45 % 90 == 0) {
                if (Math.abs(currX - startCoords[0]) > Math.abs(currY - startCoords[1])) {
                    currY = startCoords[1];
                }
                else {
                    currX = startCoords[0];
                }
            }
            else {
                if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
                    currX = startCoords[0] + (currY - startCoords[1]);
                }
                else {
                    currX = startCoords[0] - (currY - startCoords[1]);
                }
            }
            return {
                "x": currX,
                "y": currY
            };
        }
    },
    /*
    // TODO: implement bounding boxes for shapes other than images
    // expand bounding box of shape
    updateBoundingBox : function(x, y) {
    _this.drawIdBoxes[_this.drawIdBoxesOffset].left = min(_this.drawIdBoxes[_this.drawIdBoxesOffset].left, x);
    _this.drawIdBoxes[_this.drawIdBoxesOffset].right = max(_this.drawIdBoxes[_this.drawIdBoxesOffset].right, x);
    _this.drawIdBoxes[_this.drawIdBoxesOffset].up = min(_this.drawIdBoxes[_this.drawIdBoxesOffset].up, y);
    _this.drawIdBoxes[_this.drawIdBoxesOffset].down = max(_this.drawIdBoxes[_this.drawIdBoxesOffset].down, y);
    }
     */
    // move selectRec box
    dragCanvasRectContent: function(xf, yf, xt, yt, width, height) {
        let tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        let tempCanvasContext = tempCanvas.getContext("2d");
        tempCanvasContext.drawImage(this.canvas, xf, yf, width, height, 0, 0, width, height);
        this.eraseRec(xf, yf, width, height);
        this.context.drawImage(tempCanvas, xt, yt);
    },
    // clear rectangle
    eraseRec: function(fromX, fromY, width, height) {
        let _this = this;
        _this.context.beginPath();
        _this.context.rect(fromX, fromY, width, height);
        _this.context.fillStyle = "rgba(0, 0, 0, 1)";
        _this.context.globalCompositeOperation = "destination-out";
        _this.context.fill();
        _this.context.closePath();
        _this.context.globalCompositeOperation = _this.oldGCO;
    },
    // draw normal line
    drawPenLine: function(fromX, fromY, toX, toY, color, thickness) {
        let _this = this;
        _this.context.beginPath();
        _this.context.moveTo(fromX, fromY);
        _this.context.lineTo(toX, toY);
        _this.context.strokeStyle = color;
        _this.context.lineWidth = thickness;
        _this.context.lineCap = _this.lineCap;
        _this.context.stroke();
        _this.context.closePath();
    },
    // erase line
    drawEraserLine: function(fromX, fromY, toX, toY, thickness) {
        let _this = this;
        _this.context.beginPath();
        _this.context.moveTo(fromX, fromY);
        _this.context.lineTo(toX, toY);
        _this.context.strokeStyle = "rgba(0, 0, 0, 1)";
        _this.context.lineWidth = thickness * 2;
        _this.context.lineCap = _this.lineCap;
        _this.context.globalCompositeOperation = "destination-out";
        _this.context.stroke();
        _this.context.closePath();
        _this.context.globalCompositeOperation = _this.oldGCO;
    },
    // draw rectangle
    drawRec: function(fromX, fromY, toX, toY, color, thickness) {
        let _this = this;
        toX = toX - fromX;
        toY = toY - fromY;
        _this.context.beginPath();
        _this.context.rect(fromX, fromY, toX, toY);
        _this.context.strokeStyle = color;
        _this.context.lineWidth = thickness;
        _this.context.lineCap = _this.lineCap;
        _this.context.stroke();
        _this.context.closePath();
    },
    // draw circle
    drawCircle: function(fromX, fromY, radius, color, thickness) {
        let _this = this;
        _this.context.beginPath();
        _this.context.arc(fromX, fromY, radius, 0, 2 * Math.PI, false);
        _this.context.lineWidth = thickness;
        _this.context.strokeStyle = color;
        _this.context.stroke();
    },
    // clear the whiteboard
    clearWhiteboard: function() {
        let _this = this;
        // clear canvas (hack)
        _this.canvas.height = _this.canvas.height; // eslint-disable-line no-self-assign
        _this.elements.imgContainer.empty();
        _this.sendFunction({
            "t": "clear"
        });
        _this.drawBuffer = [];
        _this.drawId = 0;
        _this.imageBoxes = [];
    },
    // upload/add image
    addImgToCanvasByUrl: function(url, x, y, w, h) {
        let _this = this;
        _this.imgDragActive = true;

        // set default coordinates if necessary
        if (!x) {
            x = 200;
        }
        if (!y) {
            y = 200;
        }

        let widthTag = "",
            heightTag = "";
        if (w) {
            widthTag = ";width:" + w + "px";
        }
        if (h) {
            heightTag = ";height:" + h + "px";
        }

        // reset cursor style
        _this.elements.mouseOverlay.css({
            "cursor": "default"
        });

        // add uploader-div
        // remove 2 to adjust for border
        let imgDiv = $("<div class=\"image-mover\" style=\"left:" + (x - 2) + "px;top:" + (y - 2) + "px" + widthTag + heightTag + ";border: 2px dashed gray\">" +
            "<img class=\"img-mover-img\" src=\"" + url + "\"/>" +
            "<div class=\"img-mover-btns\">" +
            "<button class=\"js-add-btn img-mover-btn\" draw=\"1\"><i class=\"fas fa-check\"></i></button>" +
            "<button class=\"js-add-btn img-mover-btn\" draw=\"0\">BG</button>" +
            "<button class=\"js-close-btn img-mover-btn\"><i class=\"fas fa-times\"></i></button>" +
            "</div>" +
            "<i id=\"scale-icon\" class=\"fas fa-sort-down\" aria-hidden=\"true\"></i>" +
            "</div>");
        // cancel button
        imgDiv.find(".js-close-btn").click(function() {
            _this.imgDragActive = false;
            _this.setToolCursor(_this.tool);
            imgDiv.remove();
        });
        // add-buttons
        imgDiv.find(".js-add-btn").click(function() {
            let draw = $(this).attr("draw");
            _this.imgDragActive = false;
            _this.setToolCursor(_this.tool);

            let width = imgDiv.width();
            let height = imgDiv.height();
            let p = imgDiv.position();
            // add 2 to adjust for border
            let left = Math.round(p.left * 100) / 100 + 2;
            let top = Math.round(p.top * 100) / 100 + 2;
            // add to canvas
            if (draw == "1") {
                _this.drawImgToCanvas(url, width, height, left, top);

                _this.imageBoxes.push(new Object());
                _this.imageBoxes[_this.imageBoxes.length - 1].left = left;
                _this.imageBoxes[_this.imageBoxes.length - 1].right = left + width;
                _this.imageBoxes[_this.imageBoxes.length - 1].top = top;
                _this.imageBoxes[_this.imageBoxes.length - 1].bottom = top + height;
                _this.imageBoxes[_this.imageBoxes.length - 1].drawId = _this.drawId;
                _this.imageBoxes[_this.imageBoxes.length - 1].url = url;
            }
            // add to background
            else {
                _this.addToBackgroundImages(url, width, height, left, stop);
            }
            _this.sendFunction({
                "t": "addImg",
                "draw": draw,
                "url": url,
                "d": [width, height, left, top]
            });
            _this.drawId++;
            imgDiv.remove();
        });
        _this.elements.mouseOverlay.append(imgDiv);
        imgDiv.draggable();
        imgDiv.resizable();
    },
    // add image to background images div
    addToBackgroundImages: function(url, width, height, left, top) {
        this.imgContainer.append("<img crossorigin=\"anonymous\" style=\"width:" + width + "px; height:" + height + "px; position:absolute; top:" + top + "px; left:" + left + "px;\"src = \"" + url + "\">");
    },
    // draw image onto canvas
    drawImgToCanvas: function(url, width, height, left, top, doneCallback) {
        let _this = this;
        let img = document.createElement("img");
        // callback when image is loaded
        img.onload = function() {
            _this.context.drawImage(img, left, top, width, height);
            if (doneCallback) {
                doneCallback();
            }
        };
        img.src = url;
    },
    // undo action in local buffer
    undoWhiteboard: function(id, username) {
        let _this = this;

        if (!id) {
            id = -1;
        }

        if (!username) {
            username = _this.settings.username;
        }
        // determine drawId to delete/undo
        let lastDrawId = id;
        if (id == -1) {
            for (let i = _this.drawBuffer.length - 1; i >= 0; i--) {
                if (_this.drawBuffer[i]["username"] == username) {
                    lastDrawId = i;
                    break;
                }
            }

            if (lastDrawId == -1) {
                return;
            }
            lastDrawId = _this.drawBuffer[lastDrawId]["drawId"];
        }

        // remove elements and count how many were removed
        for (let i = _this.drawBuffer.length - 1; i >= 0; i--) {
            if (_this.drawBuffer[i]["drawId"] == lastDrawId && _this.drawBuffer[i]["username"] == username) {
                _this.drawBuffer.splice(i, 1);
            }
        }

        // clear canvas (hack)
        _this.canvas.height = _this.canvas.height; // eslint-disable-line no-self-assign
        _this.elements.imgContainer.empty();
        // redraw
        _this.loadDataInSteps(_this.drawBuffer, false, function() {});
    },
    // undo action
    undoWhiteboardClick: function(id) {
        if (!id) {
            id = -1;
        }
        this.sendFunction({
            "t": "undo",
            "i": id
        });
        this.undoWhiteboard(id);
    },
    // set another active tool
    setTool: function(tool) {
        this.tool = tool;
        this.setToolCursor(tool);
        this.elements.mouseOverlay.find(".js-close-btn").click();
    },
    // adjust the cursor to display something for a specific tool
    setToolCursor: function(tool) {
        let _this = this;
        if (_this.elements.ownCursor && tool !== "pen" && tool !== "eraser") {
            _this.elements.ownCursor.remove();
            _this.elements.ownCursor = undefined;
        }
        switch (tool) {
            case "pen":
            case "eraser":
                _this.elements.mouseOverlay.css({
                    "cursor": "none"
                });

                // add cursor div for our cursor to cursor container
                if (!_this.elements.ownCursor) {
                    let color = _this.drawColor;
                    let thickness = _this.thickness;
                    if (tool === "eraser") {
                        color = "#00000000";
                        thickness = thickness * 2;
                    }
                    _this.elements.ownCursor = $("<div id=\"ownCursor\" style=\"background: " + color + "; border:1px solid gray; position:absolute; width:" + thickness + "px; height:" + thickness + "px; border-radius:50%;\"></div>");
                    _this.elements.cursorContainer.append(_this.elements.ownCursor);
                }

                break;
            case "mouse":
            case "default":
                _this.elements.mouseOverlay.css({
                    "cursor": "default"
                });
                break;
            default:
                _this.elements.mouseOverlay.css({
                    "cursor": "crosshair"
                });
                break;
        }
    },
    // handle incoming data from file or server
    handleEventsAndData: function(content, isNewData, doneCallback) {
        let _this = this;
        let tool = content["t"];
        let data = content["d"];
        let color = content["c"];
        let username = content["username"];
        let thickness = content["th"];
        window.requestAnimationFrame(function() {
            if (tool === "line" || tool === "pen") {
                _this.drawPenLine(data[0], data[1], data[2], data[3], color, thickness);
            }
            else if (tool === "rect") {
                _this.drawRec(data[0], data[1], data[2], data[3], color, thickness);
            }
            else if (tool === "circle") {
                _this.drawCircle(data[0], data[1], data[2], color, thickness);
            }
            else if (tool === "eraser") {
                _this.drawEraserLine(data[0], data[1], data[2], data[3], thickness);
            }
            else if (tool === "eraseRec") {
                _this.eraseRec(data[0], data[1], data[2], data[3]);
            }
            else if (tool === "recSelect") {
                _this.dragCanvasRectContent(data[0], data[1], data[2], data[3], data[4], data[5]);
            }
            else if (tool === "addImg") {
                if (content["draw"] == "1") {
                    _this.drawImgToCanvas(content["url"], data[0], data[1], data[2], data[3], doneCallback);
                }
                else {
                    _this.addToBackgroundImages(content["url"], data[0], data[1], data[2], data[3]);
                }
            }
            else if (tool === "clear") {
                // clear canvas (hack)
                _this.canvas.height = _this.canvas.height; // eslint-disable-line no-self-assign
                this.imgContainer.empty();
                this.drawBuffer = [];
                this.drawId = 0;
                this.imageBoxes = [];
            }
            else if (tool === "cursor" && _this.settings) {
                if (content["event"] === "move") {
                    if (_this.elements.cursorContainer.find("." + content["username"]).length >= 1) {
                        _this.elements.cursorContainer.find("." + content["username"]).css({
                            "left": data[0] + "px",
                            "top": data[1] + "px"
                        });
                    }
                    else {
                        _this.elements.cursorContainer.append("<div style=\"font-size:0.8em; padding-left:2px; padding-right:2px; background:gray; color:white; border-radius:3px; position:absolute; left:" + data[0] + "; top:" + data[1] + ";\" class=\"userbadge " + content["username"] + "\">" +
                            "<div style=\"width:4px; height:4px; background:gray; position:absolute; top:-2px; left:-2px; border-radius:50%;\"></div>" +
                            content["username"] + "</div>");
                    }
                }
                else {
                    _this.elements.cursorContainer.find("." + content["username"]).remove();
                }
            }
            else if (tool === "undo") {
                _this.undoWhiteboard(content["i"], username);
            }
        });

        let toolsToDraw = ["line", "pen", "rect", "circle", "eraser", "addImg", "recSelect", "eraseRec"];

        if (isNewData && toolsToDraw.includes(tool)) {
            content["drawId"] = content["drawId"] ? content["drawId"] : _this.drawId;
            content["username"] = content["username"] ? content["username"] : _this.settings.username;
            _this.drawBuffer.push(content);
        }
    },
    // callback if a person disconnected from the whiteboard
    userLeftWhiteboard: function(username) {
        this.cursorContainer.find("." + username).remove();
    },
    refreshUserBadges: function() {
        this.cursorContainer.find(".userbadge").remove();
    },
    // get the canvas data in base64
    getImageDataBase64: function() {
        let _this = this;
        let width = this.elements.mouseOverlay.width();
        let height = this.elements.mouseOverlay.height();
        let copyCanvas = document.createElement("canvas");
        copyCanvas.width = width;
        copyCanvas.height = height;
        let ctx = copyCanvas.getContext("2d");

        $.each(_this.elements.imgContainer.find("img"), function() {
            let width = $(this).width();
            let height = $(this).height();
            let p = $(this).position();
            let left = Math.round(p.left * 100) / 100;
            let top = Math.round(p.top * 100) / 100;
            ctx.drawImage(this, left, top, width, height);
        });

        let destCtx = copyCanvas.getContext("2d");
        destCtx.drawImage(this.canvas, 0, 0);
        let url = copyCanvas.toDataURL();
        return url;
    },
    // get the canvas data as a json containing steps
    getImageDataJson: function() {
        let sendObj = [];
        for (let i = 0; i < this.drawBuffer.length; i++) {
            sendObj.push(JSON.parse(JSON.stringify(this.drawBuffer[i])));
            delete sendObj[i]["username"];
            delete sendObj[i]["wid"];
            delete sendObj[i]["drawId"];
        }
        return JSON.stringify(sendObj);
    },
    // load steps
    loadData: function(content) {
        let _this = this;
        _this.loadDataInSteps(content, true, function(stepData) {
            if (stepData["username"] == _this.settings.username && _this.drawId < stepData["drawId"]) {
                _this.drawId = stepData["drawId"] + 1;
            }
        });
    },
    // re-execute steps
    loadDataInSteps: function(content, isNewData, callAfterEveryStep) {
        let _this = this;

        function lData(index) {
            for (let i = index; i < content.length; i++) {
                if (content[i]["t"] === "addImg" && content[i]["draw"] == "1") {
                    _this.handleEventsAndData(content[i], isNewData, function() {
                        callAfterEveryStep(content[i], i);
                        lData(i + 1);
                    });
                    break;
                }
                else {
                    _this.handleEventsAndData(content[i], isNewData);
                    callAfterEveryStep(content[i], i);
                }
            }
        }
        lData(0);
    },
    // load steps from json file
    loadJsonData: function(content) {
        let _this = this;
        _this.loadDataInSteps(content, false, function(stepData, index) {
            _this.sendFunction(stepData);
            // if done
            if (index >= content.length - 1) {
                _this.drawId++;
            }
        });
    },
    // send actions to server
    sendFunction: function(content) {
        let _this = this;
        content["wid"] = _this.settings.whiteboardId;
        content["username"] = _this.settings.username;
        content["drawId"] = _this.drawId;

        let tool = content["t"];
        if (_this.settings.sendFunction) {
            _this.settings.sendFunction(content);
        }
        let validTools = ["line", "pen", "rect", "circle", "eraser", "addImg", "recSelect", "eraseRec"];
        if (validTools.includes(tool)) {
            _this.drawBuffer.push(content);
        }
    },
    // rectangle to rectangle collision check
    isRecRecCollision: function(rx1, ry1, rw1, rh1, rx2, ry2, rw2, rh2) {
        return rx1 < rx2 + rw2 && rx1 + rw1 > rx2 && ry1 < ry2 + rh2 && rh1 + ry1 > ry2;
    },
    // point in rectangle check
    isRecPointCollision: function(rx, ry, rw, rh, px, py) {
        return rx <= px && px <= rx + rw && ry <= py && py <= ry + rh;
    }
};

export {
    whiteboard
};
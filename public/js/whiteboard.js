var whiteboard = {
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
	prevX: null,
	prevY: null,
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
		mouseOverlay: null
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
		backgroundGridUrl: './img/KtEBa2.png'
	},
	// set-up (constructor)
	loadWhiteboard: function (whiteboardContainer, newSettings) {
		var svgns = "http://www.w3.org/2000/svg";
		var _this = this;
		for (var i in newSettings) {
			this.settings[i] = newSettings[i];
		}
		this.settings["username"] = this.settings["username"].replace(/[^0-9a-z]/gi, '');
		this.settings["whiteboardId"] = this.settings["whiteboardId"].replace(/[^0-9a-z]/gi, '');

		var startCoords = [];
		var svgLine = null;
		var svgRect = null;
		var svgCirle = null;
		var latestTouchCoods = null;

		// background grid (repeating image)
		_this.elements.backgroundGrid = $('<div id="background-grid" class="top-left fill" style="background-image:url(\'' + _this.settings["backgroundGridUrl"] + '\');"></div>');

		// container for background images
		_this.elements.imgContainer = $('<div id="background-container" class="top-left fill"></div>');

		// whiteboard canvas
		_this.elements.canvas = $('<canvas id="whiteboard-canvas" class="top-left"></canvas>');

		// SVG container holding drawing or moving previews
		_this.elements.svgContainer = $('<svg id="preview-container" class="top-left" width="' + _this.settings.canvasWidth + '" height="' + _this.settings.canvasHeight + '"></svg>');

		// container for cursors of other users
		_this.elements.cursorContainer = $('<div id="cursor-container" class="top-left fill"></div>');

		// drag and drop display, hidden by default
		_this.dropIndicator = $('<div id="drag-and-drop" class="top-left fill" style="display:none"><i class="far fa-plus-square" aria-hidden="true"></i></div>')

		//
		_this.elements.mouseOverlay = $('<div id="mouse-overlay" class="top-left fill"></div>');

		$(whiteboardContainer).append(_this.elements.backgroundGrid)
		.append(_this.elements.imgContainer)
		.append(_this.elements.canvas)
		.append(_this.elements.svgContainer)
		.append(_this.dropIndicator)
		.append(_this.elements.cursorContainer)
		.append(_this.elements.mouseOverlay);
		this.canvas = $("#whiteboard-canvas")[0];
		this.canvas.height = _this.settings.canvasHeight;
		this.canvas.width = _this.settings.canvasWidth;
		this.ctx = this.canvas.getContext("2d");
		this.oldGCO = this.ctx.globalCompositeOperation;

		// On mouse down
		$(_this.elements.mouseOverlay).on("mousedown touchstart", function (e) {
			if (_this.imgDragActive) {
				return;
			}
			_this.drawFlag = true;

			// Mouse X & Y
			_this.prevX = (e.offsetX || e.pageX - $(e.target).offset().left);
			_this.prevY = (e.offsetY || e.pageY - $(e.target).offset().top);

			// If on touchscreen, touch X & Y
			if (!_this.prevX || !_this.prevY) {
				var touche = e.touches[0];
				_this.prevX = touche.clientX - $(_this.elements.mouseOverlay).offset().left;
				_this.prevY = touche.clientY - $(_this.elements.mouseOverlay).offset().top;
				latestTouchCoods = [_this.prevX, _this.prevY];
			}

			// Do tool-appropriate steps
			if (_this.tool === "pen") {
				_this.drawPenLine(_this.prevX, _this.prevY, _this.prevX, _this.prevY, _this.drawcolor, _this.thickness);
				_this.sendFunction({
					"t": _this.tool,
					"d": [_this.prevX, _this.prevY, _this.prevX, _this.prevY],
					"c": _this.drawcolor,
					"th": _this.thickness
				});
			} else if (_this.tool === "moveImage") {
				var movingId = -1;
				var url;
				for (var i = _this.imageBoxes.length - 1; i >= 0; i--) {
					if (_this.prevX < _this.imageBoxes[i].right &&
						_this.prevX >= _this.imageBoxes[i].left &&
						_this.prevY < _this.imageBoxes[i].bottom &&
						_this.prevY >= _this.imageBoxes[i].top) {

						// 'undo' old image, add new one
						_this.undoWhiteboardClick(_this.imageBoxes[i].drawId);
						var width = _this.imageBoxes[i].right - _this.imageBoxes[i].left;
						var height = _this.imageBoxes[i].bottom - _this.imageBoxes[i].top;
						_this.addImgToCanvasByUrl(_this.imageBoxes[i].url, _this.imageBoxes[i].left, _this.imageBoxes[i].top, width, height);

						// delete bounding box
						_this.imageBoxes.splice(i, 1);

						break;
					}
				}
				if (movingId == -1) {
					return;
				}
			} else if (_this.tool === "eraser") {
				_this.drawEraserLine(_this.prevX, _this.prevY, _this.prevX, _this.prevY, _this.thickness);
				_this.sendFunction({
					"t": _this.tool,
					"d": [_this.prevX, _this.prevY, _this.prevX, _this.prevY],
					"th": _this.thickness
				});
			} else if (_this.tool === "line") {
				startCoords = [_this.prevX, _this.prevY];
				svgLine = document.createElementNS(svgns, 'line');
				svgLine.setAttribute('stroke', 'gray');
				svgLine.setAttribute('stroke-dasharray', '5, 5');
				svgLine.setAttribute('x1', _this.prevX);
				svgLine.setAttribute('y1', _this.prevY);
				svgLine.setAttribute('x2', _this.prevX + 1);
				svgLine.setAttribute('y2', _this.prevY + 1);
				_this.elements.svgContainer.append(svgLine);
			} else if (_this.tool === "rect" || _this.tool === "recSelect") {
				_this.elements.svgContainer.find("rect").remove();
				svgRect = document.createElementNS(svgns, 'rect');
				svgRect.setAttribute('stroke', 'gray');
				svgRect.setAttribute('stroke-dasharray', '5, 5');
				svgRect.setAttribute('style', 'fill-opacity:0.0;');
				svgRect.setAttribute('x', _this.prevX);
				svgRect.setAttribute('y', _this.prevY);
				svgRect.setAttribute('width', 0);
				svgRect.setAttribute('height', 0);
				_this.elements.svgContainer.append(svgRect);
				startCoords = [_this.prevX, _this.prevY];
			} else if (_this.tool === "circle") {
				svgCirle = document.createElementNS(svgns, 'circle');
				svgCirle.setAttribute('stroke', 'gray');
				svgCirle.setAttribute('stroke-dasharray', '5, 5');
				svgCirle.setAttribute('style', 'fill-opacity:0.0;');
				svgCirle.setAttribute('cx', _this.prevX);
				svgCirle.setAttribute('cy', _this.prevY);
				svgCirle.setAttribute('r', 0);
				_this.elements.svgContainer.append(svgCirle);
				startCoords = [_this.prevX, _this.prevY];
			}
		});

		$(_this.elements.mouseOverlay).on("mousemove touchmove", function (e) {
			e.preventDefault();
			if (_this.imgDragActive) {
				return;
			}
			var currX = (e.offsetX || e.pageX - $(e.target).offset().left);
			var currY = (e.offsetY || e.pageY - $(e.target).offset().top);
			window.requestAnimationFrame(function () {
				if ((!currX || !currY) && e.touches && e.touches[0]) {
					var touche = e.touches[0];
					currX = touche.clientX - $(_this.elements.mouseOverlay).offset().left;
					currY = touche.clientY - $(_this.elements.mouseOverlay).offset().top;
					latestTouchCoods = [currX, currY];
				}

				if (_this.drawFlag) {
					if (_this.tool === "pen") {
						_this.drawPenLine(currX, currY, _this.prevX, _this.prevY, _this.drawcolor, _this.thickness);
						_this.sendFunction({
							"t": _this.tool,
							"d": [currX, currY, _this.prevX, _this.prevY],
							"c": _this.drawcolor,
							"th": _this.thickness
						});
					} else if (_this.tool == "eraser") {
						_this.drawEraserLine(currX, currY, _this.prevX, _this.prevY, _this.thickness);
						_this.sendFunction({
							"t": _this.tool,
							"d": [currX, currY, _this.prevX, _this.prevY],
							"th": _this.thickness
						});
					}
					_this.prevX = currX;
					_this.prevY = currY;
				}

				if (_this.tool === "eraser") {
					var left = currX - _this.thickness;
					var top = currY - _this.thickness;
					_this.elements.ownCursor.css({
						"top": top + "px",
						"left": left + "px"
					});
				} else if (_this.tool === "pen") {
					var left = currX - _this.thickness / 2;
					var top = currY - _this.thickness / 2;
					_this.elements.ownCursor.css({
						"top": top + "px",
						"left": left + "px"
					});
				} else if (_this.tool === "line") {
					if (svgLine) {
						if (shiftPressed) {
							var angs = getRoundedAngles(currX, currY);
							currX = angs.x;
							currY = angs.y;
						}
						svgLine.setAttribute('x2', currX);
						svgLine.setAttribute('y2', currY);
					}
				} else if (_this.tool === "rect" || (_this.tool === "recSelect" && _this.drawFlag)) {
					if (svgRect) {
						var width = Math.abs(currX - startCoords[0]);
						var height = Math.abs(currY - startCoords[1]);
						if (shiftPressed) {
							height = width;
							var x = currX < startCoords[0] ? startCoords[0] - width : startCoords[0];
							var y = currY < startCoords[1] ? startCoords[1] - width : startCoords[1];
							svgRect.setAttribute('x', x);
							svgRect.setAttribute('y', y);
						} else {
							var x = currX < startCoords[0] ? currX : startCoords[0];
							var y = currY < startCoords[1] ? currY : startCoords[1];
							svgRect.setAttribute('x', x);
							svgRect.setAttribute('y', y);
						}

						svgRect.setAttribute('width', width);
						svgRect.setAttribute('height', height);
					}
				} else if (_this.tool === "circle") {
					var a = currX - startCoords[0];
					var b = currY - startCoords[1];
					var r = Math.sqrt(a * a + b * b);
					if (svgCirle) {
						svgCirle.setAttribute('r', r);
					}
				}
			});
			_this.sendFunction({
				"t": "cursor",
				"event": "move",
				"d": [currX, currY],
				"username": _this.settings.username
			});
		});

		$(_this.elements.mouseOverlay).on("mouseup touchend touchcancel", function (e) {
			if (_this.imgDragActive) {
				return;
			}
			_this.drawFlag = false;
			_this.drawId++;
			_this.context.globalCompositeOperation = _this.oldGCO;
			var currX = (e.offsetX || e.pageX - $(e.target).offset().left);
			var currY = (e.offsetY || e.pageY - $(e.target).offset().top);
			if ((!currX || !currY) && e.touches[0]) {
				currX = latestTouchCoods[0];
				currY = latestTouchCoods[1];
				_this.sendFunction({
					"t": "cursor",
					"event": "out",
					"username": _this.settings.username
				});
			}

			if (_this.tool === "line") {
				if (shiftPressed) {
					var angs = getRoundedAngles(currX, currY);
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
			} else if (_this.tool === "rect") {
				if (shiftPressed) {
					if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
						currY = startCoords[1] + (currX - startCoords[0]);
					} else {
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
			} else if (_this.tool === "circle") {
				var a = currX - startCoords[0];
				var b = currY - startCoords[1];
				var r = Math.sqrt(a * a + b * b);
				_this.drawCircle(startCoords[0], startCoords[1], r, _this.drawcolor, _this.thickness);
				_this.sendFunction({
					"t": _this.tool,
					"d": [startCoords[0], startCoords[1], r],
					"c": _this.drawcolor,
					"th": _this.thickness
				});
				_this.elements.svgContainer.find("circle").remove();
			} else if (_this.tool === "recSelect") {
				_this.imgDragActive = true;
				if (shiftPressed) {
					if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
						currY = startCoords[1] + (currX - startCoords[0]);
					} else {
						currY = startCoords[1] - (currX - startCoords[0]);
					}
				}

				var width = Math.abs(startCoords[0] - currX);
				var height = Math.abs(startCoords[1] - currY);
				var left = startCoords[0] < currX ? startCoords[0] : currX;
				var top = startCoords[1] < currY ? startCoords[1] : currY;
				_this.elements.mouseOverlay.css({
					"cursor": "default"
				});
				var imgDiv = $('<div style="position:absolute; left:' + left + 'px; top:' + top + 'px; width:' + width + 'px; border: 2px dotted gray; overflow: hidden; height:' + height + 'px;" cursor:move;">' +
						'<canvas style="cursor:move; position:absolute; top:0px; left:0px;" width="' + width + '" height="' + height + '"/>' +
						'<div style="position:absolute; right:5px; top:3px;">' +
						'<button draw="1" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToCanvasBtn btn btn-default">Drop</button> ' +
						'<button style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="xCanvasBtn btn btn-default">x</button>' +
						'</div>' +
						'</div>');
				var dragCanvas = $(imgDiv).find("canvas");
				var dragOutOverlay = $('<div class="dragOutOverlay" style="position:absolute; left:' + left + 'px; top:' + top + 'px; width:' + width + 'px; height:' + height + 'px; background:white;"></div>');
				_this.elements.mouseOverlay.append(dragOutOverlay);
				_this.elements.mouseOverlay.append(imgDiv);

				var destCanvasContext = dragCanvas[0].getContext('2d');
				destCanvasContext.drawImage(_this.canvas, left, top, width, height, 0, 0, width, height);
				imgDiv.find(".xCanvasBtn").click(function () {
					_this.imgDragActive = false;
					if (_this.tool === "pen") {
						_this.elements.mouseOverlay.css({
							"cursor": "none"
						});
					} else {
						_this.elements.mouseOverlay.css({
							"cursor": "crosshair"
						});
					}
					imgDiv.remove();
					dragOutOverlay.remove();
				});
				imgDiv.find(".addToCanvasBtn").click(function () {
					_this.imgDragActive = false;
					if (_this.tool === "pen") {
						_this.elements.mouseOverlay.css({
							"cursor": "none"
						});
					} else {
						_this.elements.mouseOverlay.css({
							"cursor": "crosshair"
						});
					}

					var widthT = imgDiv.width();
					var heightT = imgDiv.height();
					var p = imgDiv.position();
					var leftT = Math.round(p.left * 100) / 100;
					var topT = Math.round(p.top * 100) / 100;
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

		$(_this.elements.mouseOverlay).on("mouseout", function (e) {
			if (_this.imgDragActive) {
				return;
			}
			_this.drawFlag = false;
			_this.mouseover = false;
			_this.context.globalCompositeOperation = _this.oldGCO;
			_this.elements.ownCursor.remove();
			_this.elements.svgContainer.find("line").remove();
			_this.elements.svgContainer.find("rect").remove();
			_this.elements.svgContainer.find("circle").remove();
			_this.sendFunction({
				"t": "cursor",
				"event": "out"
			});
		});

		$(_this.elements.mouseOverlay).on("mouseover", function (e) {
			if (_this.imgDragActive) {
				return;
			}
			if (!_this.mouseover) {
				var color = _this.drawcolor;
				var widthHeight = _this.thickness;
				if (_this.tool === "eraser") {
					color = "#00000000";
					widthHeight = widthHeight * 2;
				}
				if (_this.tool === "eraser" || _this.tool === "pen") {
					_this.elements.ownCursor = $('<div id="ownCursor" style="background:' + color + '; border:1px solid gray; position:absolute; width:' + widthHeight + 'px; height:' + widthHeight + 'px; border-radius:50%;"></div>');
					_this.elements.cursorContainer.append(_this.elements.ownCursor);
				}
			}
			_this.mouseover = true;
		});

		var strgPressed = false;
		var zPressed = false;
		var shiftPressed = false;
		$(document).on("keydown", function (e) {
			if (e.which == 17) {
				strgPressed = true;
			} else if (e.which == 90) {
				if (strgPressed && !zPressed) {
					_this.undoWhiteboardClick();
				}
				zPressed = true;
			} else if (e.which == 16) {
				shiftPressed = true;
			} else if (e.which == 27) { //Esc
				if (!_this.drawFlag)
					_this.elements.svgContainer.empty();
				_this.elements.mouseOverlay.find(".xCanvasBtn").click(); //Remove all current drops
			} else if (e.which == 46) { //Remove / Entf
				$.each(_this.elements.mouseOverlay.find(".dragOutOverlay"), function () {
					var width = $(this).width();
					var height = $(this).height();
					var p = $(this).position();
					var left = Math.round(p.left * 100) / 100;
					var top = Math.round(p.top * 100) / 100;
					_this.drawId++;
					_this.sendFunction({
						"t": "eraseRec",
						"d": [left, top, width, height]
					});
					_this.eraseRec(left, top, width, height);
				});
				_this.elements.mouseOverlay.find(".xCanvasBtn").click(); //Remove all current drops
			}
			//console.log(e.which);
		});
		$(document).on("keyup", function (e) {
			if (e.which == 17) {
				strgPressed = false;
			} else if (e.which == 90) {
				zPressed = false;
			} else if (e.which == 16) {
				shiftPressed = false;
			}
		});

		function getRoundedAngles(currX, currY) { //For drawing lines at 0, 45, 90° ....
			var x = currX - startCoords[0];
			var y = currY - startCoords[1];
			var angle = Math.atan2(x, y) * (180 / Math.PI);
			var angle45 = Math.round(angle / 45) * 45;
			if (angle45 % 90 == 0) {
				if (Math.abs(currX - startCoords[0]) > Math.abs(currY - startCoords[1])) {
					currY = startCoords[1]
				} else {
					currX = startCoords[0]
				}
			} else {
				if ((currY - startCoords[1]) * (currX - startCoords[0]) > 0) {
					currX = startCoords[0] + (currY - startCoords[1]);
				} else {
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
	// expand bounding box of shape
	updateBoundingBox : function(x, y) {
	_this.drawIdBoxes[_this.drawIdBoxesOffset].left = min(_this.drawIdBoxes[_this.drawIdBoxesOffset].left, x);
	_this.drawIdBoxes[_this.drawIdBoxesOffset].right = max(_this.drawIdBoxes[_this.drawIdBoxesOffset].right, x);
	_this.drawIdBoxes[_this.drawIdBoxesOffset].up = min(_this.drawIdBoxes[_this.drawIdBoxesOffset].up, y);
	_this.drawIdBoxes[_this.drawIdBoxesOffset].down = max(_this.drawIdBoxes[_this.drawIdBoxesOffset].down, y);
	}
	 */
	// move selectRec box
	dragCanvasRectContent: function (xf, yf, xt, yt, width, height) {
		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = width;
		tempCanvas.height = height;
		var tempCanvasContext = tempCanvas.getContext('2d');
		tempCanvasContext.drawImage(this.canvas, xf, yf, width, height, 0, 0, width, height);
		this.eraseRec(xf, yf, width, height);
		this.ctx.drawImage(tempCanvas, xt, yt);
	},
	// clear rectangle
	eraseRec: function (fromX, fromY, width, height) {
		var _this = this;
		_this.context.beginPath();
		_this.context.rect(fromX, fromY, width, height);
		_this.context.fillStyle = "rgba(0, 0, 0, 1)";
		_this.context.globalCompositeOperation = "destination-out";
		_this.context.fill();
		_this.context.closePath();
		_this.context.globalCompositeOperation = _this.oldGCO;
	},
	// draw normal line
	drawPenLine: function (fromX, fromY, toX, toY, color, thickness) {
		var _this = this;
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
	drawEraserLine: function (fromX, fromY, toX, toY, thickness) {
		var _this = this;
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
	drawRec: function (fromX, fromY, toX, toY, color, thickness) {
		var _this = this;
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
	drawCircle: function (fromX, fromY, radius, color, thickness) {
		var _this = this;
		_this.context.beginPath();
		_this.context.arc(fromX, fromY, radius, 0, 2 * Math.PI, false);
		_this.context.lineWidth = thickness;
		_this.context.strokeStyle = color;
		_this.context.stroke();
	},
	// clear the whiteboard
	clearWhiteboard: function () {
		var _this = this;
		_this.canvas.height = _this.canvas.height;
		_this.elements.imgContainer.empty();
		_this.sendFunction({
			"t": "clear"
		});
		_this.drawBuffer = [];
		_this.drawId = 0;
		_this.imageBoxes = [];
	},
	// upload/add image
	addImgToCanvasByUrl: function (url, x, y, w, h) {
		var _this = this;
		_this.imgDragActive = true;

		// set default coordinates if necessary
		if (!x) {
			x = 200;
		}
		if (!y) {
			y = 200;
		}

		var widthTag = "",
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
		var imgDiv = $('<div class="image-mover" style="left:' + (x - 2) + 'px;top:' + (y - 2) + 'px' + widthTag + heightTag + '">' +
				'<img id="img-mover-img" src="' + url + '"/>' +
				'<div id="img-mover-btns">' +
				'<button class="js-add-btn img-mover-btn" draw="1">✓</button>' +
				'<button class="js-add-btn img-mover-btn" draw="0">BG</button>' +
				'<button class="js-close-btn img-mover-btn">❌</button>' +
				'</div>' +
				'<i id="scale-icon" class="fas fa-sort-down" aria-hidden="true"></i>' +
				'</div>');
		// cancel button
		imgDiv.find(".js-close-btn").click(function () {
			_this.imgDragActive = false;
			if (_this.tool === "pen") {
				// disable cursor
				_this.elements.mouseOverlay.css({
					"cursor": "none"
				});
			} else if (_this.tool === "mouse") {
				// regular mouse to show other people
				_this.elements.mouseOverlay.css({
					"cursor": "auto"
				});
			} else {
				// use crosshair for other tools
				_this.elements.mouseOverlay.css({
					"cursor": "crosshair"
				});
			}
			imgDiv.remove();
		});
		// add-buttons
		imgDiv.find(".js-add-btn").click(function () {
			var draw = $(this).attr("draw");
			_this.imgDragActive = false;
			if (_this.tool === "pen") {
				_this.elements.mouseOverlay.css({
					"cursor": "none"
				});
			} else if (_this.tool === "mouse") {
				_this.elements.mouseOverlay.css({
					"cursor": "auto"
				});
			} else {
				_this.elements.mouseOverlay.css({
					"cursor": "crosshair"
				});
			}
			var width = imgDiv.width();
			var height = imgDiv.height();
			var p = imgDiv.position();
			// add 2 to adjust for border
			var left = Math.round(p.left * 100) / 100 + 2;
			var top = Math.round(p.top * 100) / 100 + 2;
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
				_this.drawImgToBackground(url, width, height, left, stop);
			}
			_this.sendFunction({
				"t": "addImgBG",
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
	drawImgToBackground(url, width, height, left, top) {
		this.imgContainer.append('<img crossorigin="anonymous" style="width:' + width + 'px; height:' + height + 'px; position:absolute; top:' + top + 'px; left:' + left + 'px;" src="' + url + '">')
	},
	drawImgToCanvas(url, width, height, left, top, doneCallback) {
		var _this = this;
		var img = document.createElement('img');
		img.onload = function () {
			_this.context.drawImage(img, left, top, width, height);
			if (doneCallback) {
				doneCallback();
			}
		}
		img.src = url;
	},
	// undo action in local buffer
	undoWhiteboard: function (id, username) {
		var _this = this;

		if (!id) {
			id = -1;
		}

		if (!username) {
			username = _this.settings.username;
		}
		// determine drawId to delete/undo
		var lastDrawId = id;
		if (id == -1) {
			for (var i = _this.drawBuffer.length - 1; i >= 0; i--) {
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
		var removeCount = 0;
		for (var i = _this.drawBuffer.length - 1; i >= 0; i--) {
			if (_this.drawBuffer[i]["drawId"] == lastDrawId && _this.drawBuffer[i]["username"] == username) {
				_this.drawBuffer.splice(i, 1);
				removeCount++;
			}
		}

		// redraw
		_this.canvas.height = _this.canvas.height;
		_this.elements.imgContainer.empty();
		_this.loadDataInSteps(_this.drawBuffer, false, function (stepData) {
			//Nothing to do
		});
	},
	undoWhiteboardClick: function (id) {
		if (!id) {
			id = -1;
		}
		this.sendFunction({
			"t": "undo",
			"i": id
		});
		this.undoWhiteboard(id);

	},
	setTool: function (tool) {
		this.tool = tool;
		if (tool === "pen" || tool === "eraser") {
			this.mouseOverlay.css({
				"cursor": "none"
			});
		} else if (tool === "mouse") {
			this.mouseOverlay.css({
				"cursor": "default"
			});
		} else {
			this.mouseOverlay.css({
				"cursor": "crosshair"
			});
		}
		this.mouseOverlay.find(".xCanvasBtn").click();
	},
	// handle incoming data from file or server
	handleEventsAndData: function (content, isNewData, doneCallback) {
		var _this = this;
		var tool = content["t"];
		var data = content["d"];
		var color = content["c"];
		var username = content["username"];
		var thickness = content["th"];
		window.requestAnimationFrame(function () {
			if (tool === "line" || tool === "pen") {
				_this.drawPenLine(data[0], data[1], data[2], data[3], color, thickness);
			} else if (tool === "rect") {
				_this.drawRec(data[0], data[1], data[2], data[3], color, thickness);
			} else if (tool === "circle") {
				_this.drawCircle(data[0], data[1], data[2], color, thickness);
			} else if (tool === "eraser") {
				_this.drawEraserLine(data[0], data[1], data[2], data[3], thickness);
			} else if (tool === "eraseRec") {
				_this.eraseRec(data[0], data[1], data[2], data[3]);
			} else if (tool === "recSelect") {
				_this.dragCanvasRectContent(data[0], data[1], data[2], data[3], data[4], data[5]);
			} else if (tool === "addImgBG") {
				if (content["draw"] == "1") {
					_this.drawImgToCanvas(content["url"], data[0], data[1], data[2], data[3], doneCallback)
				} else {
					_this.drawImgToBackground(content["url"], data[0], data[1], data[2], data[3]);
				}
			} else if (tool === "clear") {
				_this.canvas.height = _this.canvas.height;
				this.imgContainer.empty();
				this.drawBuffer = [];
				this.drawId = 0;
				this.imageBoxes = [];
			} else if (tool === "cursor" && _this.settings) {
				if (content["event"] === "move") {
					if (_this.elements.cursorContainer.find("." + content["username"]).length >= 1) {
						_this.elements.cursorContainer.find("." + content["username"]).css({
							"left": data[0] + "px",
							"top": data[1] + "px"
						});
					} else {
						_this.elements.cursorContainer.append('<div style="font-size:0.8em; padding-left:2px; padding-right:2px; background:gray; color:white; border-radius:3px; position:absolute; left:' + data[0] + '; top:' + data[1] + ';" class="userbadge ' + content["username"] + '">' +
							'<div style="width:4px; height:4px; background:gray; position:absolute; top:-2px; left:-2px; border-radius:50%;"></div>' +
							content["username"] + '</div>');
					}
				} else {
					_this.elements.cursorContainer.find("." + content["username"]).remove();
				}
			} else if (tool === "undo") {
				_this.undoWhiteboard(content["i"], username);
			}
		});

		if (isNewData && (tool === "line" || tool === "pen" || tool === "rect" || tool === "circle" || tool === "eraser" || tool === "addImgBG" || tool === "recSelect" || tool === "eraseRec")) {
			content["drawId"] = content["drawId"] ? content["drawId"] : _this.drawId;
			content["username"] = content["username"] ? content["username"] : _this.settings.username;
			_this.drawBuffer.push(content);
		}
	},
	userLeftWhiteboard(username) {
		this.cursorContainer.find("." + username).remove();
	},
	refreshUserBadges() {
		this.cursorContainer.find(".userbadge").remove();
	},
	getImageDataBase64() {
		_this = this;
		var width = this.mouseOverlay.width();
		var height = this.mouseOverlay.height();
		var copyCanvas = document.createElement('canvas');
		copyCanvas.width = width;
		copyCanvas.height = height;
		var ctx = copyCanvas.getContext("2d");

		$.each(_this.elements.imgContainer.find("img"), function () {
			var width = $(this).width();
			var height = $(this).height();
			var p = $(this).position();
			var left = Math.round(p.left * 100) / 100;
			var top = Math.round(p.top * 100) / 100;
			ctx.drawImage(this, left, top, width, height);
		});

		var destCtx = copyCanvas.getContext('2d');
		destCtx.drawImage(this.canvas, 0, 0);
		var url = copyCanvas.toDataURL();
		return url;
	},
	getImageDataJson() {
		var sendObj = [];
		for (var i = 0; i < this.drawBuffer.length; i++) {
			sendObj.push(JSON.parse(JSON.stringify(this.drawBuffer[i])));
			delete sendObj[i]["username"];
			delete sendObj[i]["wid"];
			delete sendObj[i]["drawId"];
		}
		return JSON.stringify(sendObj);
	},
	loadData: function (content) {
		var _this = this;
		_this.loadDataInSteps(content, true, function (stepData) {
			if (stepData["username"] == _this.settings.username && _this.drawId < stepData["drawId"]) {
				_this.drawId = stepData["drawId"] + 1;
			}
		});
	},
	loadDataInSteps(content, isNewData, callAfterEveryStep, doneCallback) {
		var _this = this;

		function lData(index) {
			for (var i = index; i < content.length; i++) {
				if (content[i]["t"] === "addImgBG" && content[i]["draw"] == "1") {
					_this.handleEventsAndData(content[i], isNewData, function () {
						callAfterEveryStep(content[i], i);
						lData(i + 1);
					});
					break;
				} else {
					_this.handleEventsAndData(content[i], isNewData);
					callAfterEveryStep(content[i], i);
				}
			}
		}
		lData(0);
	},
	loadJsonData(content) {
		var _this = this;
		_this.loadDataInSteps(content, false, function (stepData, index) {
			_this.sendFunction(stepData);
			if (index >= content.length - 1) { //Done with all data
				_this.drawId++;
			}
		});
	},
	sendFunction: function (content) { //Sends every draw to server
		var _this = this;
		content["wid"] = _this.settings.whiteboardId;
		content["username"] = _this.settings.username;
		content["drawId"] = _this.drawId;

		var tool = content["t"];
		if (_this.settings.sendFunction) {
			_this.settings.sendFunction(content);
		}
		var validTools = ['line', 'pen', 'rect', 'circle', 'eraser', 'addImgBG', 'recSelect', 'eraseRec'];
		if (validTools.includes(tool)) {
			_this.drawBuffer.push(content);
		}
	},
	isRecRecCollision: function (rx1, ry1, rw1, rh1, rx2, ry2, rw2, rh2) {
		return rx1 < rx2 + rw2 && rx1 + rw1 > rx2 && ry1 < ry2 + rh2 && rh1 + ry1 > ry2;
	},
	isRecPointCollision: function (rx, ry, rw, rh, px, py) {
		return rx <= px && px <= rx + rw && ry <= py && py <= ry + rh;
	}
}

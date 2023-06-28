import * as util from './util.js';
import * as Constants from './constants.js';
import {Defaults} from './constants.js';
import * as events from './events.js';
import {Item} from './item.js';

export class Wheel {

  /**
   * `container` must be an Element.
   * `props` must be an Object or null.
   */
  constructor(container, props = {}) {

    // Init some things:
    this._frameRequestId = null;
    this._rotationSpeed = 0;
    this._rotationDirection = 1;

    // Validate params.
    if (!(container instanceof Element)) throw new Error('container must be an instance of Element');
    if (!util.isObject(props) && props !== null) throw new Error('props must be an Object or null');

    this._canvasContainer = container;
    this.canvas = document.createElement('canvas');
    this._context = this.canvas.getContext('2d');

    this.addCanvas();
    events.register(this);

    // Assign default values.
    // This avoids null exceptions when we initalise each property one-by-one in `init()`.
    for (const i of Object.keys(Defaults.wheel)) {
      this['_' + i] = Defaults.wheel[i];
    }

    if (props) {
      this.init(props);
    } else {
      this.init(Defaults.wheel);
    }

  }

  /**
   * Initialise all properties.
   */
  init(props = {}) {
    this._isInitialising = true;

    this.borderColor = props.borderColor;
    this.borderWidth = props.borderWidth;
    this.debug = props.debug;
    this.image = props.image;
    this.isInteractive = props.isInteractive;
    this.itemBackgroundColors = props.itemBackgroundColors;
    this.itemLabelAlign = props.itemLabelAlign;
    this.itemLabelBaselineOffset = props.itemLabelBaselineOffset;
    this.itemLabelColors = props.itemLabelColors;
    this.itemLabelFont = props.itemLabelFont;
    this.itemLabelFontSizeMax = props.itemLabelFontSizeMax;
    this.itemLabelRadius = props.itemLabelRadius;
    this.itemLabelRadiusMax = props.itemLabelRadiusMax;
    this.itemLabelRotation = props.itemLabelRotation;
    this.items = props.items;
    this.lineColor = props.lineColor;
    this.lineWidth = props.lineWidth;
    this.pixelRatio = props.pixelRatio;
    this.rotationSpeedMax = props.rotationSpeedMax;
    this.radius = props.radius;
    this.rotation = props.rotation;
    this.rotationResistance = props.rotationResistance;
    this.offset = props.offset;
    this.onCurrentIndexChange = props.onCurrentIndexChange;
    this.onRest = props.onRest;
    this.onSpin = props.onSpin;
    this.overlayImage = props.overlayImage;
    this.pointerAngle = props.pointerAngle;
  }

  addCanvas() {
    this._canvasContainer.appendChild(this.canvas);
  }

  removeCanvas() {
    this._canvasContainer.removeChild(this.canvas);
  }

  remove() {
    window.cancelAnimationFrame(this._frameRequestId);
    events.unregister(this);
    this.removeCanvas();
  }

  /**
   * Resize the wheel to fit inside it's container.
   * Call this after changing any property of the wheel that relates to it's size or position.
   */
  resize() {

    // Get the smallest dimension of `canvasContainer`:
    const [w, h] = [
      this._canvasContainer.clientWidth * this.getActualPixelRatio(),
      this._canvasContainer.clientHeight * this.getActualPixelRatio(),
    ];

    // Calc the size that the wheel needs to be to fit in it's container:
    const minSize = Math.min(w, h);
    const wheelSize = {
      w: minSize - (minSize * this.offset.w),
      h: minSize - (minSize * this.offset.h),
    };
    const scale = Math.min(w / wheelSize.w, h / wheelSize.h);
    this._size = Math.max(wheelSize.w * scale, wheelSize.h * scale);

    // Resize canvas element:
    this.canvas.style.width = this._canvasContainer.clientWidth + 'px';
    this.canvas.style.height = this._canvasContainer.clientHeight + 'px';
    this.canvas.width = w;
    this.canvas.height = h;

    // Re-calculate the center of the wheel:
    this._center = {
      x: w / 2 + (w * this.offset.w),
      y: h / 2 + (h * this.offset.h),
    };

    // Recalculate the wheel radius:
    this._actualRadius = (this._size / 2) * this.radius;

    // Adjust the font size of labels so they all fit inside `wheelRadius`:
    this.itemLabelFontSize = this.itemLabelFontSizeMax * (this._size / Constants.baseCanvasSize);
    this.labelMaxWidth = this._actualRadius * (this.itemLabelRadius - this.itemLabelRadiusMax);
    for (const item of this._items) {
      this.itemLabelFontSize = Math.min(this.itemLabelFontSize, util.getFontSizeToFit(item.label, this.itemLabelFont, this.labelMaxWidth, this._context));
    }

    this.refresh();

  }

  /**
   * Main animation loop.
   */
  draw(now = 0) {

    this._frameRequestId = null;

    const ctx = this._context;

    // Clear canvas.
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.animateRotation(now);

    const angles = this.getItemAngles(this._rotation);

    const actualBorderWidth = this.getActualBorderWidth();

    // Set font:
    ctx.textBaseline = 'middle';
    ctx.textAlign = this.itemLabelAlign;
    ctx.font = this.itemLabelFontSize + 'px ' + this.itemLabelFont;

    ctx.save();

    // Build paths:
    for (const [i, a] of angles.entries()) {

      const path = new Path2D();
      path.moveTo(this._center.x, this._center.y);
      path.arc(
        this._center.x,
        this._center.y,
        this._actualRadius - (actualBorderWidth / 2),
        util.degRad(a.start + Constants.arcAdjust),
        util.degRad(a.end + Constants.arcAdjust)
      );

      this._items[i].path = path;

    }

    this.drawItemBackgrounds(ctx, angles);
    this.drawItemImages(ctx, angles);
    this.drawItemLines(ctx, angles);
    this.drawItemLabels(ctx, angles);
    this.drawBorder(ctx);
    this.drawImage(ctx, this._image, false);
    this.drawImage(ctx, this._overlayImage, true);
    this.drawPointerLine(ctx);
    this.drawDragEvents(ctx);

    this._isInitialising = false;

  }

  drawItemBackgrounds(ctx, angles = []) {

    for (const [i, a] of angles.entries()) {

      const item = this._items[i];

      ctx.fillStyle = item.backgroundColor ?? (
        // Fall back to a value from the repeating set:
        this.itemBackgroundColors[i % this.itemBackgroundColors.length]
      );

      ctx.fill(item.path);

    }

  }

  drawItemImages(ctx, angles = []) {

    for (const [i, a] of angles.entries()) {

      const item = this._items[i];

      if (!util.isImageLoaded(item.image)) continue;

      ctx.save();

      ctx.clip(item.path);

      const angle = a.start + ((a.end - a.start) / 2);

      ctx.translate(
        this._center.x + Math.cos(util.degRad(angle + Constants.arcAdjust)) * (this._actualRadius * item.imageRadius),
        this._center.y + Math.sin(util.degRad(angle + Constants.arcAdjust)) * (this._actualRadius * item.imageRadius)
      );

      ctx.rotate(util.degRad(angle + item.imageRotation));

      const width = (this._size / 500) * item.image.width * item.imageScale;
      const height = (this._size / 500) * item.image.height * item.imageScale;
      const widthHalf = -width / 2;
      const heightHalf = -height / 2;

      ctx.drawImage(
        item.image,
        widthHalf,
        heightHalf,
        width,
        height
      );

      ctx.restore();

    }

  }

  drawImage(ctx, image, isOverlay = false) {

    if (!util.isImageLoaded(image)) return;

    ctx.translate(
      this._center.x,
      this._center.y
    );

    if (!isOverlay) ctx.rotate(util.degRad(this._rotation));

    // Draw the image centered and scaled to fit the wheel's container:
    // For convenience, scale the 'normal' image to the size of the wheel radius
    // (so a change in the wheel radius won't require the image to also be updated).
    const size = isOverlay ? this._size : this._size * this.radius;
    const sizeHalf = -(size / 2);

    ctx.drawImage(
      image,
      sizeHalf,
      sizeHalf,
      size,
      size
    );

    ctx.resetTransform();

  }

  drawPointerLine(ctx) {

    if (!this.debug) return;

    ctx.translate(
      this._center.x,
      this._center.y
    );

    ctx.rotate(util.degRad(this._pointerAngle + Constants.arcAdjust));

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(this._actualRadius * 2, 0);

    ctx.strokeStyle = Constants.Debugging.pointerLineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.resetTransform();

  }

  drawBorder(ctx) {

    if (this.borderWidth <= 0) return;

    const actualBorderWidth = this.getActualBorderWidth();
    const actualBorderColor = this._borderColor || 'transparent';

    ctx.beginPath();
    ctx.strokeStyle = actualBorderColor;
    ctx.lineWidth = actualBorderWidth;
    ctx.arc(this._center.x, this._center.y, this._actualRadius - (actualBorderWidth / 2), 0, 2 * Math.PI);
    ctx.stroke();

    if (this.debug) {
      ctx.beginPath();
      ctx.strokeStyle = ctx.strokeStyle = Constants.Debugging.labelRadiusColor;
      ctx.lineWidth = 1;
      ctx.arc(this._center.x, this._center.y, this._actualRadius * this.itemLabelRadius, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = ctx.strokeStyle = Constants.Debugging.labelRadiusColor;
      ctx.lineWidth = 1;
      ctx.arc(this._center.x, this._center.y, this._actualRadius * this.itemLabelRadiusMax, 0, 2 * Math.PI);
      ctx.stroke();
    }

  }

  drawItemLines(ctx, angles = []) {

    if (this.lineWidth <= 0) return;

    const actualLineWidth = (this.lineWidth / Constants.baseCanvasSize) * this._size;
    const actualBorderWidth = this.getActualBorderWidth();

    ctx.translate(
      this._center.x,
      this._center.y
    );

    for (const angle of angles) {
      ctx.rotate(util.degRad(angle.start + Constants.arcAdjust));

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this._actualRadius - actualBorderWidth, 0);

      ctx.strokeStyle = this.lineColor;
      ctx.lineWidth = actualLineWidth;
      ctx.stroke();

      ctx.rotate(-util.degRad(angle.start + Constants.arcAdjust));
    }

    ctx.resetTransform();

  }

  drawItemLabels(ctx, angles = []) {

    const actualItemLabelBaselineOffset = this.itemLabelFontSize * -this.itemLabelBaselineOffset;

    for (const [i, a] of angles.entries()) {

      const item = this._items[i];

      const actualLabelColor = item.labelColor
        || (this._itemLabelColors[i % this._itemLabelColors.length] // Fall back to a value from the repeating set.
        || 'transparent'); // Handle empty string/undefined.

      if (item.label.trim() === '' || actualLabelColor === 'transparent') continue;

      ctx.save();

      ctx.clip(item.path);

      const angle = a.start + ((a.end - a.start) / 2);

      ctx.translate(
        this._center.x + Math.cos(util.degRad(angle + Constants.arcAdjust)) * (this._actualRadius * this.itemLabelRadius),
        this._center.y + Math.sin(util.degRad(angle + Constants.arcAdjust)) * (this._actualRadius * this.itemLabelRadius)
      );

      ctx.rotate(util.degRad(angle + Constants.arcAdjust));

      ctx.rotate(util.degRad(this.itemLabelRotation));

      if (this.debug) {
        // Draw the outline of the label:
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-this.labelMaxWidth, 0);

        ctx.strokeStyle = Constants.Debugging.labelOutlineColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeRect(0, -this.itemLabelFontSize / 2, -this.labelMaxWidth, this.itemLabelFontSize);
      }

      ctx.fillStyle = actualLabelColor;
      ctx.fillText(item.label, 0, actualItemLabelBaselineOffset);

      ctx.restore();

    }

  }

  drawDragEvents(ctx) {

    if (!this.debug || !this.dragEvents?.length) return;

    const dragEventsReversed = [...this.dragEvents].reverse();

    for (const [i, event] of dragEventsReversed.entries()) {
      const percent = (i / this.dragEvents.length) * 100;
      ctx.beginPath();
      ctx.arc(event.x, event.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = `hsl(${Constants.Debugging.dragEventHue},100%,${percent}%)`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.fill();
      ctx.stroke();
    }

  }

  animateRotation(now = 0) {

    // For spinTo()
    if (this._spinToTimeEnd !== undefined) {

      // Check if we should end the animation.
      if (now >= this._spinToTimeEnd) {
        this.rotation = this._spinToEndRotation;
        this._spinToTimeEnd = undefined;
        this.raiseEvent_onRest();
        return;
      }

      this.refresh(); // Ensure the animation loop is active.

      const duration = this._spinToTimeEnd - this._spinToTimeStart;
      let delta = (now - this._spinToTimeStart) / duration;
      delta = (delta < 0)? 0 : delta; // Frame time may be before the start time.
      const distance = this._spinToEndRotation - this._spinToStartRotation;

      this.rotation = this._spinToStartRotation + distance * this._spinToEasingFunction(delta);
      return;

    }

    // For spin()
    if (this._rotationSpeed !== 0) {

      this.refresh(); // Ensure the animation loop is active.

      if (this._lastFrameTime === undefined) this._lastFrameTime = now;

      const delta = now - this._lastFrameTime;

      if (delta > 0) {

        this.rotation += ((delta / 1000) * this._rotationSpeed) % 360; // TODO: very small rounding errors can accumulative here.
        this._rotationSpeed = this.getRotationSpeedPlusDrag(delta);
        if (this._rotationSpeed === 0) this.raiseEvent_onRest();
        this._lastFrameTime = now;

      }

      return;

    }

    this._lastFrameTime = undefined;

  }

  getRotationSpeedPlusDrag(delta = 0) {

    // Simulate drag:
    const newRotationSpeed = this._rotationSpeed + ((this.rotationResistance * (delta / 1000)) * this._rotationDirection);

    // Stop rotation once speed reaches 0.
    // Otherwise the wheel could rotate in the opposite direction next frame.
    if ((this._rotationDirection === 1 && newRotationSpeed < 0) || (this._rotationDirection === -1 && newRotationSpeed >= 0)) {
      return 0;
    }

    return newRotationSpeed;

  }

  /**
   * Spin the wheel by setting `rotationSpeed`.
   * The wheel will immediately start spinning, and slow down over time depending on the value of `rotationResistance`.
   * A positive number will spin clockwise, a negative number will spin anticlockwise.
   */
  spin(rotationSpeed = 0) {
    if (!util.isNumber(rotationSpeed)) throw new Error('rotationSpeed must be a number');
    this.beginSpin(rotationSpeed, 'spin');
  }

  /**
   * Spin the wheel to a particular rotation.
   * The animation will occur over the provided `duration` (milliseconds).
   * The animation can be adjusted by providing an optional `easingFunction` which accepts a single parameter n, where n is between 0 and 1 inclusive.
   * If no easing function is provided, the default easeSinOut will be used.
   * For example easing functions see [easing-utils](https://github.com/AndrewRayCode/easing-utils).
   * Note: the `Wheel.rotationSpeed` property will be ignored during the animation.
   */
  spinTo(rotation = 0, duration = 0, easingFunction = null) {

    if (Number.isNaN(rotation)) throw new Error('Error: newRotation parameter is NaN'); // TODO: check is valid number. Same for duration param.

    this.stop();

    this.animate(rotation, duration, easingFunction);

    this.raiseEvent_onSpin({method: 'spinto', targetRotation: rotation, duration});

  }

  /**
   * Spin the wheel to a particular item.
   * The animation will occur over the provided `duration` (milliseconds).
   * If `spinToCenter` is true, the wheel will spin to the center of the item, otherwise the wheel will spin to a random angle inside the item.
   * `numberOfRevolutions` controls how many times the wheel will rotate a full 360 degrees before resting on the item.
   * The animation can be adjusted by providing an optional `easingFunction` which accepts a single parameter n, where n is between 0 and 1 inclusive.
   * If no easing function is provided, the default easeSinOut will be used.
   * For example easing functions see [easing-utils](https://github.com/AndrewRayCode/easing-utils).
   * Note: the `Wheel.rotationSpeed` property will be ignored during the animation.
   */
  spinToItem(itemIndex = 0, duration = 0, spinToCenter = true, numberOfRevolutions = 1, direction = 1, easingFunction = null) {

    this.stop();

    const itemAngle = spinToCenter ? this.items[itemIndex].getCenterAngle() : this.items[itemIndex].getRandomAngle();

    let newRotation = util.calcWheelRotationForTargetAngle(this.rotation, itemAngle - this._pointerAngle, direction);
    newRotation += ((numberOfRevolutions * 360) * direction);

    this.animate(newRotation, duration, easingFunction);

    this.raiseEvent_onSpin({method: 'spintoitem', targetItemIndex: itemIndex, targetRotation: newRotation, duration});

  }

  animate(newRotation, duration, easingFunction) {
    this._spinToStartRotation = this.rotation;
    this._spinToEndRotation = newRotation;
    this._spinToTimeStart = performance.now();
    this._spinToTimeEnd = this._spinToTimeStart + duration;
    this._spinToEasingFunction = easingFunction || util.easeSinOut;
    this.refresh();
  }

  /**
   * Immediately stop the wheel from spinning, regardless of which method was used to spin it.
   */
  stop() {
    // Stop the wheel if it was spun via `spin()`.
    this._rotationSpeed = 0;

    // Stop the wheel if it was spun via `spinTo()`.
    this._spinToTimeEnd = undefined;
  }

  /**
   * Return the scaled border size.
   */
  getActualBorderWidth() {
     return (this.borderWidth / Constants.baseCanvasSize) * this._size;
  }

  getActualPixelRatio() {
    return (this._pixelRatio !== 0) ? this._pixelRatio : window.devicePixelRatio;
  }

  /**
   * Return true if the given point is inside the wheel.
   */
  wheelHitTest(point = {x:0, y:0}) {
    const p = util.translateXYToElement(point, this.canvas, this.getActualPixelRatio());
    return util.isPointInCircle(p, this._center.x, this._center.y, this._actualRadius);
  }

  /**
   * Refresh the cursor state.
   * Call this after the pointer moves.
   */
  refreshCursor() {

    if (this.isInteractive) {

      if (this.isDragging) {
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (this.isCursorOverWheel) {
        this.canvas.style.cursor = 'grab';
        return;
      }

    }

    this.canvas.style.cursor = '';

  }

  /**
   * Get the angle (in degrees) of the given point from the center of the wheel.
   * 0 is north.
   */
  getAngleFromCenter(point = {x:0, y:0}) {
    return (util.getAngle(this._center.x, this._center.y, point.x, point.y) + 90) % 360;
  }

  /**
   * Get the index of the item that the Pointer is pointing at.
   * An item is considered "current" if `pointerAngle` is between it's start angle (inclusive)
   * and it's end angle (exclusive).
   */
  getCurrentIndex() {
    return this._currentIndex;
  }

  /**
   * Calculate and set `currentIndex`
   */
  refreshCurrentIndex(angles = []) {
    if (this._items.length === 0) this._currentIndex = -1;

    for (const [i, a] of angles.entries()) {

      if (!util.isAngleBetween(this._pointerAngle, a.start % 360, a.end % 360)) continue;

      if (this._currentIndex === i) break;

      this._currentIndex = i;

      if (!this._isInitialising) this.raiseEvent_onCurrentIndexChange();

      break;

    }
  }

  /**
   * Return an array of objects containing the start angle (inclusive) and end angle (inclusive) of each item.
   */
  getItemAngles(initialRotation = 0) {

    let weightSum = 0;
    for (const i of this.items) {
      weightSum += i.weight;
    }
    const weightedItemAngle = 360 / weightSum;

    let itemAngle;
    let lastItemAngle = initialRotation;
    const angles = [];

    for (const item of this._items) {
      itemAngle = item.weight * weightedItemAngle;
      angles.push({
        start: lastItemAngle,
        end: lastItemAngle + itemAngle,
      });
      lastItemAngle += itemAngle;
    }

    // Ensure the difference between last angle.end and first angle.start is exactly 360 degrees.
    // Sometimes floating point arithmetic pushes the end value past 360 degrees by
    // a very small amount, which causes issues when calculating `currentIndex`.
    if (this._items.length > 1) {
      angles[angles.length - 1].end = angles[0].start + 360;
    }

    return angles;

  }

  /**
   * Schedule a redraw of the wheel on the canvas.
   * Call this after changing any property of the wheel that relates to it's appearance.
   */
  refresh() {
    if (this._frameRequestId === null) {
      this._frameRequestId = window.requestAnimationFrame(this.draw.bind(this));
    }
  }

  limitSpeed(speed = 0, max = 0) {
    // Max is always a positive number, but speed may be positive or negative.
    const newSpeed = Math.min(speed, max);
    return Math.max(newSpeed, -max);
  }

  beginSpin(speed = 0, spinMethod = '') {
    this.stop();

    this._rotationSpeed = this.limitSpeed(speed, this._rotationSpeedMax);

    this._rotationDirection = (this._rotationSpeed >= 0) ? 1 : -1; // 1 for clockwise or stationary, -1 for anticlockwise.

    if (this._rotationSpeed !== 0) {
      this.raiseEvent_onSpin({
        method: spinMethod,
        rotationSpeed: this._rotationSpeed,
        rotationResistance: this._rotationResistance,
      });
    }

    this.refresh();
  }

  /**
   * The color of the line around the circumference of the wheel.
   */
  get borderColor() {
    return this._borderColor;
  }
  set borderColor(val) {
    this._borderColor = util.setProp({
      val,
      isValid: typeof val === 'string',
      errorMessage: 'Wheel.borderColor must be a string',
      defaultValue: Defaults.wheel.borderColor,
    });

    this.refresh();
  }

  /**
   * The width (in pixels) of the line around the circumference of the wheel.
   */
  get borderWidth() {
    return this._borderWidth;
  }
  set borderWidth(val) {
    this._borderWidth = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.borderWidth must be a number',
      defaultValue: Defaults.wheel.borderWidth,
    });

    this.refresh();
  }

  /**
   * Show debugging info.
   * This is particularly helpful when fine-tuning labels.
   */
  get debug() {
    return this._debug;
  }
  set debug(val) {
    this._debug = util.setProp({
      val,
      isValid: typeof val === 'boolean',
      errorMessage: 'Wheel.debug must be a boolean',
      defaultValue: Defaults.wheel.debug,
    });

    this.refresh();
  }

  /**
   * The url of an image that will be drawn over the center of the wheel which will rotate with the wheel.
   * It will be automatically scaled to fit `radius`.
   */
  get image() {
    return this._image?.src ?? null;
  }
  set image(val) {
    this._image = util.setProp({
      val,
      isValid: typeof val === 'string' || val === null,
      errorMessage: 'Wheel.image must be a url (string) or null',
      defaultValue: Defaults.wheel.image,
      action: () => {
        if (val === null) return null;
        const v = new Image();
        v.src = val;
        v.onload = e => this.refresh();
        return v;
      },
    });

    this.refresh();
  }

  /**
   * Allow the user to spin the wheel using click-drag/touch-flick.
   * User interaction will only be detected within the bounds of `Wheel.radius`.
   */
  get isInteractive() {
    return this._isInteractive;
  }
  set isInteractive(val) {
    this._isInteractive = util.setProp({
      val,
      isValid: typeof val === 'boolean',
      errorMessage: 'Wheel.isInteractive must be a boolean',
      defaultValue: Defaults.wheel.isInteractive,
    });

    this.refreshCursor(); // Reset the cursor in case the wheel is currently being dragged.
  }

  /**
   * The repeating pattern of background colors for all items.
   * Overridden by `Item.backgroundColor`.
   * Example: `['#fff','#000']`.
   */
  get itemBackgroundColors() {
    return this._itemBackgroundColors;
  }
  set itemBackgroundColors(val) {
    this._itemBackgroundColors = util.setProp({
      val,
      isValid: Array.isArray(val),
      errorMessage: 'Wheel.itemBackgroundColors must be an array',
      defaultValue: Defaults.wheel.itemBackgroundColors,
    });

    this.refresh();
  }

  /**
   * The alignment of all item labels.
   * Accepted values: `'left'`|`'center'`|`'right'`.
   * You may need to set `itemLabelRotation` in combination with this.
   */
  get itemLabelAlign() {
    return this._itemLabelAlign;
  }
  set itemLabelAlign(val) {
    this._itemLabelAlign = util.setProp({
      val,
      isValid: typeof val === 'string',
      errorMessage: 'Wheel.itemLabelAlign must be a string',
      defaultValue: Defaults.wheel.itemLabelAlign,
    });

    this.refresh();
  }

  /**
   * The offset of the baseline (or line height) of all item labels (as a percent of the label's height).
   */
  get itemLabelBaselineOffset() {
    return this._itemLabelBaselineOffset;
  }
  set itemLabelBaselineOffset(val) {
    this._itemLabelBaselineOffset = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.itemLabelBaselineOffset must be a number',
      defaultValue: Defaults.wheel.itemLabelBaselineOffset,
    });

    this.resize();
  }

  /**
   * The repeating pattern of colors for all item labels.
   * Overridden by `Item.labelColor`.
   * Example: `['#fff','#000']`.
   */
  get itemLabelColors() {
    return this._itemLabelColors;
  }
  set itemLabelColors(val) {
    this._itemLabelColors = util.setProp({
      val,
      isValid: Array.isArray(val),
      errorMessage: 'Wheel.itemLabelColors must be an array',
      defaultValue: Defaults.wheel.itemLabelColors,
    });

    this.refresh();
  }

  /**
   * The font family for all item labels.
   * Overridden by `Item.labelFont`.
   * Example: `'sans-serif'`.
   */
  get itemLabelFont() {
    return this._itemLabelFont;
  }
  set itemLabelFont(val) {
    this._itemLabelFont = util.setProp({
      val,
      isValid: typeof val === 'string',
      errorMessage: 'Wheel.itemLabelFont must be a string',
      defaultValue: Defaults.wheel.itemLabelFont,
    });

    this.resize();
  }

  /**
   * The maximum font size (in pixels) for all item labels.
   */
  get itemLabelFontSizeMax() {
    return this._itemLabelFontSizeMax;
  }
  set itemLabelFontSizeMax(val) {
    this._itemLabelFontSizeMax = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.itemLabelFontSizeMax must be a number',
      defaultValue: Defaults.wheel.itemLabelFontSizeMax,
    });

    this.resize();
  }

  /**
   * The point along the radius (as a percent, starting from the center of the wheel)
   * to start drawing all item labels.
   */
  get itemLabelRadius() {
    return this._itemLabelRadius;
  }
  set itemLabelRadius(val) {
    this._itemLabelRadius = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.itemLabelRadius must be a number',
      defaultValue: Defaults.wheel.itemLabelRadius,
    });

    this.resize();
  }

  /**
   * The point along the radius (as a percent, starting from the center of the wheel)
   * to calculate the maximum font size for all item labels.
   */
  get itemLabelRadiusMax() {
    return this._itemLabelRadiusMax;
  }
  set itemLabelRadiusMax(val) {
    this._itemLabelRadiusMax = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.itemLabelRadiusMax must be a number',
      defaultValue: Defaults.wheel.itemLabelRadiusMax,
    });

    this.resize();
  }

  /**
   * The rotation of all item labels.
   * Use this to flip the labels `180°` in combination with `itemLabelAlign`.
   */
  get itemLabelRotation() {
    return this._itemLabelRotation;
  }
  set itemLabelRotation(val) {
    this._itemLabelRotation = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.itemLabelRotation must be a number',
      defaultValue: Defaults.wheel.itemLabelRotation,
    });

    this.refresh();
  }

  /**
   * The items to show on the wheel.
   */
  get items() {
    return this._items;
  }
  set items(val) {
    this._items = util.setProp({
      val,
      isValid: Array.isArray(val),
      errorMessage: 'Wheel.items must be an array of Items',
      defaultValue: Defaults.wheel.items,
      action: () => {
        const v = [];
        for (const item of val) {
          v.push(new Item(this, {
            backgroundColor: item.backgroundColor,
            image: item.image,
            imageRadius: item.imageRadius,
            imageRotation: item.imageRotation,
            imageScale: item.imageScale,
            label: item.label,
            labelColor: item.labelColor,
            value: item.value,
            weight: item.weight,
          }));
        }
        return v;
      },
    });

    this.refreshCurrentIndex(this.getItemAngles(this._rotation));
  }

  /**
   * The color of the lines between the items.
   */
  get lineColor() {
    return this._lineColor;
  }
  set lineColor(val) {
    this._lineColor = util.setProp({
      val,
      isValid: typeof val === 'string',
      errorMessage: 'Wheel.lineColor must be a string',
      defaultValue: Defaults.wheel.lineColor,
    });

    this.refresh();
  }

  /**
   * The width (in pixels) of the lines between the items.
   */
  get lineWidth() {
    return this._lineWidth;
  }
  set lineWidth(val) {
    this._lineWidth = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.lineWidth must be a number',
      defaultValue: Defaults.wheel.lineWidth,
    });

    this.refresh();
  }

  /**
   * The offset of the wheel relative to it's center (as a percent of the wheel's diameter).
   */
  get offset() {
    return this._offset;
  }
  set offset(val) {
    this._offset = util.setProp({
      val,
      isValid: util.isObject(val),
      errorMessage: 'Wheel.offset must be an object',
      defaultValue: Defaults.wheel.offset,
    });

    this.resize();
  }

  /**
   * The callback for the `onCurrentIndexChange` event.
   */
  get onCurrentIndexChange() {
    return this._onCurrentIndexChange;
  }
  set onCurrentIndexChange(val) {
    this._onCurrentIndexChange = util.setProp({
      val,
      isValid: typeof val === 'function' || val === null,
      errorMessage: 'Wheel.onCurrentIndexChange must be a function or null',
      defaultValue: Defaults.wheel.onCurrentIndexChange,
    });
  }

  /**
   * The callback for the `onRest` event.
   */
  get onRest() {
    return this._onRest;
  }
  set onRest(val) {
    this._onRest = util.setProp({
      val,
      isValid: typeof val === 'function' || val === null,
      errorMessage: 'Wheel.onRest must be a function or null',
      defaultValue: Defaults.wheel.onRest,
    });
  }

  /**
   * The callback for the `onSpin` event.
   */
  get onSpin() {
    return this._onSpin;
  }
  set onSpin(val) {
    this._onSpin = util.setProp({
      val,
      isValid: typeof val === 'function' || val === null,
      errorMessage: 'Wheel.onSpin must be a function or null',
      defaultValue: Defaults.wheel.onSpin,
    });
  }

  /**
   * The url of an image that will be drawn over the center of the wheel which will not rotate with the wheel.
   * It will be automatically scaled to fit the container's smallest dimension.
   * Use this to draw decorations around the wheel, such as a stand or pointer.
   */
  get overlayImage() {
    return this._overlayImage?.src ?? null;
  }
  set overlayImage(val) {
    this._overlayImage = util.setProp({
      val,
      isValid: typeof val === 'string' || val === null,
      errorMessage: 'Wheel.overlayImage must be a url (string) or null',
      defaultValue: Defaults.wheel.overlayImage,
      action: () => {
        if (val === null) return null;
        const v = new Image();
        v.src = val;
        v.onload = e => this.refresh();
        return v;
      },
    });

    this.refresh();
  }

  /**
   * The pixel ratio used to render the wheel.
   * Values above 0 will produce a sharper image at the cost of performance.
   * A value of `0` will cause the pixel ratio to be automatically determined using `window.devicePixelRatio`.
   */
  get pixelRatio() {
    return this._pixelRatio;
  }
  set pixelRatio(val) {
    this._pixelRatio = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.pixelRatio must be a number',
      defaultValue: Defaults.wheel.pixelRatio,
    });

    this.resize();
  }

  /**
   * The angle of the Pointer which is used to determine the `currentIndex` (or the "winning" item).
   */
  get pointerAngle() {
    return this._pointerAngle;
  }
  set pointerAngle(val) {
    this._pointerAngle = util.setProp({
      val,
      isValid: util.isNumber(val) && val >= 0,
      errorMessage: 'Wheel.pointerAngle must be a number between 0 and 360',
      defaultValue: Defaults.wheel.pointerAngle,
      action: () => val % 360,
    });

    if (this.debug) this.refresh();
  }

  /**
   * The radius of the wheel (as a percent of the container's smallest dimension).
   */
  get radius() {
    return this._radius;
  }
  set radius(val) {
    this._radius = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.radius must be a number',
      defaultValue: Defaults.wheel.radius,
    });

    this.resize();
  }

  /**
   * The rotation (angle in degrees) of the wheel.
   * `0` is north.
   * The first item will be drawn clockwise from this point.
   */
  get rotation() {
    return this._rotation;
  }
  set rotation(val) {
    this._rotation = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.rotation must be a number',
      defaultValue: Defaults.wheel.rotation,
    });

    this.refreshCurrentIndex(this.getItemAngles(this._rotation));
    this.refresh();
  }

  /**
   * The amount that `rotationSpeed` will be reduced by every second.
   * Only in effect when `rotationSpeed !== 0`.
   * Set to `0` to spin the wheel infinitely.
   */
  get rotationResistance() {
    return this._rotationResistance;
  }
  set rotationResistance(val) {
    this._rotationResistance = util.setProp({
      val,
      isValid: util.isNumber(val),
      errorMessage: 'Wheel.rotationResistance must be a number',
      defaultValue: Defaults.wheel.rotationResistance,
    });
  }

  /**
   * (Readonly) How far (angle in degrees) the wheel will spin every 1 second.
   * A positive number means the wheel is spinning clockwise, a negative number means anticlockwise, and `0` means the wheel is not spinning.
   */
  get rotationSpeed() {
    return this._rotationSpeed;
  }

  /**
   * The maximum value for `rotationSpeed` (ignoring the wheel's spin direction).
   * The wheel will not spin faster than this value in any direction.
   */
  get rotationSpeedMax() {
    return this._rotationSpeedMax;
  }
  set rotationSpeedMax(val) {
    this._rotationSpeedMax = util.setProp({
      val,
      isValid: util.isNumber(val) && val >= 0,
      errorMessage: 'Wheel.rotationSpeedMax must be a number >= 0',
      defaultValue: Defaults.wheel.rotationSpeedMax,
    });
  }

  /**
   * Enter the drag state.
   */
  dragStart(point = {x:0, y:0}) {

    const p = util.translateXYToElement(point, this.canvas, this.getActualPixelRatio());

    this.isDragging = true;

    this.stop(); // Interrupt `spinTo()`

    this.dragEvents = [{
      distance: 0,
      x: p.x,
      y: p.y,
      now:performance.now(),
    }];

    this.refreshCursor();

  }

  dragMove(point = {x:0, y:0}) {

    const p = util.translateXYToElement(point, this.canvas, this.getActualPixelRatio());
    const a = this.getAngleFromCenter(p);

    const lastDragPoint = this.dragEvents[0];
    const lastAngle = this.getAngleFromCenter(lastDragPoint);
    const angleSinceLastMove = util.diffAngle(lastAngle, a);

    this.dragEvents.unshift({
      distance: angleSinceLastMove,
      x: p.x,
      y: p.y,
      now:performance.now(),
    });

    // Retain max 40 events when debugging.
    if (this.debug && this.dragEvents.length >= 40) this.dragEvents.pop();

    // Snap the wheel to the new rotation.
    this.rotation += angleSinceLastMove; // TODO: can we apply easing here so it looks nicer?

  }

  /**
   * Exit the drag state.
   * Set the rotation speed so the wheel continues to spin in the same direction.
   */
  dragEnd() {

    this.isDragging = false;

    // Calc the drag distance:
    let dragDistance = 0;
    const now = performance.now();

    for (const [i, event] of this.dragEvents.entries()) {

      if (!this.isDragEventTooOld(now, event)) {
        dragDistance += event.distance;
        continue;
      }

      // Exclude old events:
      this.dragEvents.length = i;
      break;

    }

    this.refreshCursor();

    if (dragDistance === 0) return;

    this.beginSpin(dragDistance * (1000 / Constants.dragCapturePeriod), 'interact');

  }

  isDragEventTooOld(now = 0, event = {}) {
    return (now - event.now) > Constants.dragCapturePeriod;
  }

  raiseEvent_onCurrentIndexChange(data = {}) {
    this.onCurrentIndexChange?.({
      type: 'currentIndexChange',
      currentIndex: this._currentIndex,
      ...data,
    });
  }

  raiseEvent_onRest(data = {}) {
    this.onRest?.({
      type: 'rest',
      currentIndex: this._currentIndex,
      rotation: this._rotation,
      ...data,
    });
  }

  raiseEvent_onSpin(data = {}) {
    this.onSpin?.({
      type: 'spin',
      ...data,
    });
  }

}

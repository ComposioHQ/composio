"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
exports.CancelablePromise = exports.CancelError = void 0;
var CancelError = /** @class */ (function (_super) {
    __extends(CancelError, _super);
    function CancelError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = 'CancelError';
        return _this;
    }
    Object.defineProperty(CancelError.prototype, "isCancelled", {
        get: function () {
            return true;
        },
        enumerable: false,
        configurable: true
    });
    return CancelError;
}(Error));
exports.CancelError = CancelError;
var CancelablePromise = /** @class */ (function () {
    function CancelablePromise(executor) {
        var _this = this;
        this._isResolved = false;
        this._isRejected = false;
        this._isCancelled = false;
        this.cancelHandlers = [];
        this.promise = new Promise(function (resolve, reject) {
            _this._resolve = resolve;
            _this._reject = reject;
            var onResolve = function (value) {
                if (_this._isResolved || _this._isRejected || _this._isCancelled) {
                    return;
                }
                _this._isResolved = true;
                if (_this._resolve)
                    _this._resolve(value);
            };
            var onReject = function (reason) {
                if (_this._isResolved || _this._isRejected || _this._isCancelled) {
                    return;
                }
                _this._isRejected = true;
                if (_this._reject)
                    _this._reject(reason);
            };
            var onCancel = function (cancelHandler) {
                if (_this._isResolved || _this._isRejected || _this._isCancelled) {
                    return;
                }
                _this.cancelHandlers.push(cancelHandler);
            };
            Object.defineProperty(onCancel, 'isResolved', {
                get: function () { return _this._isResolved; }
            });
            Object.defineProperty(onCancel, 'isRejected', {
                get: function () { return _this._isRejected; }
            });
            Object.defineProperty(onCancel, 'isCancelled', {
                get: function () { return _this._isCancelled; }
            });
            return executor(onResolve, onReject, onCancel);
        });
    }
    Object.defineProperty(CancelablePromise.prototype, Symbol.toStringTag, {
        get: function () {
            return "Cancellable Promise";
        },
        enumerable: false,
        configurable: true
    });
    CancelablePromise.prototype.then = function (onFulfilled, onRejected) {
        return this.promise.then(onFulfilled, onRejected);
    };
    CancelablePromise.prototype["catch"] = function (onRejected) {
        return this.promise["catch"](onRejected);
    };
    CancelablePromise.prototype["finally"] = function (onFinally) {
        return this.promise["finally"](onFinally);
    };
    CancelablePromise.prototype.cancel = function () {
        if (this._isResolved || this._isRejected || this._isCancelled) {
            return;
        }
        this._isCancelled = true;
        if (this.cancelHandlers.length) {
            try {
                for (var _i = 0, _a = this.cancelHandlers; _i < _a.length; _i++) {
                    var cancelHandler = _a[_i];
                    cancelHandler();
                }
            }
            catch (error) {
                console.warn('Cancellation threw an error', error);
                return;
            }
        }
        this.cancelHandlers.length = 0;
        if (this._reject)
            this._reject(new CancelError('Request aborted'));
    };
    Object.defineProperty(CancelablePromise.prototype, "isCancelled", {
        get: function () {
            return this._isCancelled;
        },
        enumerable: false,
        configurable: true
    });
    return CancelablePromise;
}());
exports.CancelablePromise = CancelablePromise;

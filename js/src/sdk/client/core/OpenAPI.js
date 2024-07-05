"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.OpenAPI = exports.Interceptors = void 0;
var Interceptors = /** @class */ (function () {
    function Interceptors() {
        this._fns = [];
    }
    Interceptors.prototype.eject = function (fn) {
        var index = this._fns.indexOf(fn);
        if (index !== -1) {
            this._fns = __spreadArray(__spreadArray([], this._fns.slice(0, index), true), this._fns.slice(index + 1), true);
        }
    };
    Interceptors.prototype.use = function (fn) {
        this._fns = __spreadArray(__spreadArray([], this._fns, true), [fn], false);
    };
    return Interceptors;
}());
exports.Interceptors = Interceptors;
exports.OpenAPI = {
    BASE: 'https://backend.composio.dev/api',
    CREDENTIALS: 'include',
    ENCODE_PATH: undefined,
    HEADERS: undefined,
    PASSWORD: undefined,
    TOKEN: undefined,
    USERNAME: undefined,
    VERSION: '1.0.0',
    WITH_CREDENTIALS: false,
    interceptors: {
        request: new Interceptors(),
        response: new Interceptors()
    }
};

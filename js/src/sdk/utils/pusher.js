"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.PusherUtils = void 0;
var PusherClient = require("pusher-js");
var PUSHER_KEY = "ff9f18c208855d77a152";
var PUSHER_CLUSTER = "mt1";
var PusherUtils = /** @class */ (function () {
    function PusherUtils() {
    }
    PusherUtils.getPusherClient = function (baseURL, apiKey) {
        if (!PusherUtils.pusherClient) {
            PusherUtils.pusherClient = new PusherClient(PUSHER_KEY, {
                cluster: PUSHER_CLUSTER,
                channelAuthorization: {
                    endpoint: "".concat(baseURL, "/v1/client/auth/pusher_auth"),
                    headers: {
                        "x-api-key": apiKey
                    },
                    transport: "ajax"
                }
            });
        }
        return PusherUtils.pusherClient;
    };
    /**
     * Subscribes to a Pusher channel and binds an event to a callback function.
     * @param {string} channelName - The name of the channel to subscribe to.
     * @param {string} event - The event to bind to the channel.
     * @param {(data: any) => void} fn - The callback function to execute when the event is triggered.
     * @returns {PusherClient} The Pusher client instance.
     */
    PusherUtils.subscribe = function (channelName, event, fn) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, PusherUtils.pusherClient.subscribe(channelName).bind(event, fn)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error("Error subscribing to ".concat(channelName, " with event ").concat(event, ": ").concat(error_1));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Unsubscribes from a Pusher channel.
     * @param {string} channelName - The name of the channel to unsubscribe from.
     * @returns {void}
     */
    PusherUtils.unsubscribe = function (channelName) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                PusherUtils.pusherClient.unsubscribe(channelName);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Binds an event to a channel with support for chunked messages.
     * @param {PusherClient} channel - The Pusher channel to bind the event to.
     * @param {string} event - The event to bind to the channel.
     * @param {(data: any) => void} callback - The callback function to execute when the event is triggered.
     */
    PusherUtils.bindWithChunking = function (channel, event, callback) {
        channel.bind(event, callback); // Allow normal unchunked events.
        // Now the chunked variation. Allows arbitrarily long messages.
        var events = {};
        channel.bind("chunked-" + event, function (data) {
            if (!events.hasOwnProperty(data.id)) {
                events[data.id] = { chunks: [], receivedFinal: false };
            }
            var ev = events[data.id];
            ev.chunks[data.index] = data.chunk;
            if (data.final)
                ev.receivedFinal = true;
            if (ev.receivedFinal && ev.chunks.length === Object.keys(ev.chunks).length) {
                callback(JSON.parse(ev.chunks.join("")));
                delete events[data.id];
            }
        });
    };
    /**
     * Subscribes to a trigger channel for a client and handles chunked data.
     * @param {string} clientId - The unique identifier for the client subscribing to the events.
     * @param {(data: any) => void} fn - The callback function to execute when trigger data is received.
     */
    PusherUtils.triggerSubscribe = function (clientId, fn) {
        var channel = PusherUtils.pusherClient.subscribe("private-".concat(clientId, "_triggers"));
        PusherUtils.bindWithChunking(channel, "trigger_to_client", fn);
        console.log("Subscribed to ".concat(clientId, "_triggers"));
    };
    PusherUtils.triggerUnsubscribe = function (clientId) {
        PusherUtils.pusherClient.unsubscribe("".concat(clientId, "_triggers"));
    };
    return PusherUtils;
}());
exports.PusherUtils = PusherUtils;

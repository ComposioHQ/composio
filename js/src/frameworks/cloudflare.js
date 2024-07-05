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
exports.CloudflareToolSet = void 0;
var base_toolset_1 = require("../sdk/base.toolset");
var CloudflareToolSet = /** @class */ (function (_super) {
    __extends(CloudflareToolSet, _super);
    /**
     * Composio toolset for Cloudflare framework.
     *
     * Example:
     * ```typescript
     *
     * ```
     */
    function CloudflareToolSet(config) {
        return _super.call(this, config.apiKey || null, config.baseUrl || null, "cloudflare", config.entityId || "default") || this;
    }
    CloudflareToolSet.prototype.get_actions = function (filters) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.client.actions.list({})];
                    case 1: return [2 /*return*/, (((_a = (_b.sent()).items) === null || _a === void 0 ? void 0 : _a.filter(function (a) {
                            return filters.actions.includes(a.name);
                        }).map(function (action) {
                            var formattedSchema = {
                                name: action.name,
                                description: action.description,
                                parameters: action.parameters
                            };
                            var tool = {
                                type: "function",
                                "function": formattedSchema
                            };
                            return tool;
                        })) || [])];
                }
            });
        });
    };
    CloudflareToolSet.prototype.get_tools = function (filters) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.client.actions.list({
                            apps: filters.apps.join(","),
                            tags: (_a = filters.tags) === null || _a === void 0 ? void 0 : _a.join(","),
                            filterImportantActions: !filters.tags && !filters.useCase,
                            useCase: filters.useCase || undefined
                        })];
                    case 1: return [2 /*return*/, (((_b = (_c.sent()).items) === null || _b === void 0 ? void 0 : _b.map(function (action) {
                            var formattedSchema = {
                                name: action.name,
                                description: action.description,
                                parameters: action.parameters
                            };
                            var tool = {
                                type: "function",
                                "function": formattedSchema
                            };
                            return tool;
                        })) || [])];
                }
            });
        });
    };
    CloudflareToolSet.prototype.execute_tool_call = function (tool, entityId) {
        if (entityId === void 0) { entityId = null; }
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _b = (_a = JSON).stringify;
                        return [4 /*yield*/, this.execute_action(tool.name, JSON.parse(tool.arguments), entityId || this.entityId)];
                    case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                }
            });
        });
    };
    CloudflareToolSet.prototype.handle_tool_call = function (result, entityId) {
        if (entityId === void 0) { entityId = null; }
        return __awaiter(this, void 0, void 0, function () {
            var outputs, _i, _a, tool_call, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        outputs = [];
                        _i = 0, _a = result.tool_calls;
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        tool_call = _a[_i];
                        if (!tool_call.name) return [3 /*break*/, 3];
                        _c = (_b = outputs).push;
                        return [4 /*yield*/, this.execute_tool_call(result.tool_calls[0], entityId)];
                    case 2:
                        _c.apply(_b, [_d.sent()]);
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, outputs];
                }
            });
        });
    };
    return CloudflareToolSet;
}(base_toolset_1.ComposioToolSet));
exports.CloudflareToolSet = CloudflareToolSet;

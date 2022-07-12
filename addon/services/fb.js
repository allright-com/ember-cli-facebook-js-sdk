import Evented from "@ember/object/evented";
import Service from "@ember/service";
import { getOwner } from "@ember/application";
import { Promise, resolve, reject } from "rsvp";
import { next } from "@ember/runloop";

export default class Fb extends Service.extend(Evented) {
    fbInitPromise = null;
    locale = null;
    refreshToken = true;

    FBInit(options = {}) {
        if (this.fbInitPromise) {
            return this.fbInitPromise;
        }

        const ENV = getOwner(this).resolveRegistration("config:environment");

        const initSettings = Object.assign({}, ENV.FB || {}, options);

        // Detect language configuration and store it.
        const locale = initSettings.locale || "en_US";
        this.locale = locale;

        if (ENV.FB && ENV.FB.skipInit) {
            this.fbInitPromise = resolve("skip init");
            return this.fbInitPromise;
        }

        const original = window.fbAsyncInit;
        if (!initSettings || !initSettings.appId || !initSettings.version) {
            return reject("No settings for init");
        }

        this.fbInitPromise = new Promise(function (resolve) {
            window.fbAsyncInit = function () {
                window.FB.init(initSettings);
                next(null, resolve);
            };
            // URL for the SDK is built according to locale. Defaults to `en_US`.
            const scriptURL = `https://connect.facebook.net/${locale}/sdk.js`;
            const head = document.getElementsByTagName("head")[0];
            const script = document.createElement("script");
            script.src = scriptURL;
            head.appendChild(script);
        }).then(function () {
            if (original) {
                window.fbAsyncInit = original;
                window.fbAsyncInit();
                window.fbAsyncInit.hasRun = true;
            }
        });

        return this.fbInitPromise;
    }

    setAccessToken(token) {
        this.accessToken = token;
        return token;
    }

    loginWith = (token) => {
        console.warn("DEPRECATED: please, use setAccessToken instead");
        this.setAccessToken(token);
    }

    _api(path) {
        let method = "GET";
        let parameters = {};
        let arg;

        if (!path) {
            return reject("Please, provide a path for your request");
        }

        switch (arguments.length) {
            case 2:
                arg = arguments[1];
                if (typeof arg === "string") {
                    method = arg;
                } else {
                    parameters = arg;
                }
                break;
            case 3:
                method = arguments[1];
                parameters = arguments[2];
        }

        if (!parameters.access_token) {
            parameters = Object.assign(parameters, { access_token: this.accessToken });
        }

        return this.FBInit().then(function () {
            return new Promise(function (resolve, reject) {
                window.FB.api(path, method, parameters, function (response) {
                    if (response.error) {
                        next(null, reject, response.error);
                        return;
                    }

                    next(null, resolve, response);
                });
            });
        });
    }

    api() {
        return this._api(...arguments).catch((error) => {
            if (
                this.refreshToken &&
                (error.code === 190 || error.code === 2500)
            ) {
                console.debug(
                    "Trying to refresh Facebook session an re-do the Facebook API request"
                );
                return this.getLoginStatus().then((response) => {
                    if (response.status === "connected") {
                        this.setAccessToken(response.authResponse.accessToken);
                        return this._api(...arguments);
                    }
                    return reject(response);
                });
            }
            return reject(error);
        });
    }

    ui = (params) => {
        return this.FBInit().then(function () {
            return new Promise(function (resolve, reject) {
                window.FB.ui(params, function (response) {
                    if (response && !response.error_code) {
                        next(null, resolve, response);
                        return;
                    }

                    next(null, reject, response);
                });
            });
        });
    }

    // Facebook Login Methods

    getLoginStatus = (forceRequest) => {
        return this.FBInit().then(function () {
            return new Promise(function (resolve) {
                window.FB.getLoginStatus(function (response) {
                    next(null, resolve, response);
                }, forceRequest);
            });
        });
    }

    login = (scope, options = {}) => {
        const service = this;
        let params = { scope: scope, return_scopes: true };

        if (options) {
            params = Object.assign({}, params, options);
        }

        return this.FBInit().then(function () {
            return new Promise(function (resolve, reject) {
                window.FB.login(function (response) {
                    if (response.authResponse) {
                        service.accessToken = response.authResponse.accessToken;
                        next(null, resolve, response);
                    } else {
                        next(null, reject, response);
                    }
                }, params);
            });
        });
    }

    logout = () => {
        return this.FBInit().then(function () {
            return new Promise(function (resolve) {
                window.FB.logout(function (response) {
                    next(null, resolve, response);
                });
            });
        });
    }

    getAuthResponse = () => {
        return window.FB.getAuthResponse();
    }

    xfbml_pars = () => {
        return this.FBInit().then(function () {
            return new Promise(function (resolve) {
                return window.FB.XFBML.parse(undefined, function () {
                    next(null, resolve, "XFBML.parse");
                });
            });
        });
    }
}

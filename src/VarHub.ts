import {Room} from "./Room";
import {TypedEventTarget} from "./TypedEventTarget";
import {RoomCreateEvent} from "./events/VarHubEvents";
import {RoomInfo} from "./types";

type VarHubEvents = {
    "roomCreate": RoomCreateEvent
}

const getDefaultPopupFeatures = () => {
    const height = 500;
    const width = 500;
    const left = window.screenX + window.outerWidth/2 - width/2;
    const top = window.screenY + window.outerHeight/2 - height/2;
    return [
        `height=${height}`,
        `width=${width}`,
        "menubar=off",
        "toolbar=off",
        "location=off",
        "status=off",
        "resizable=off",
        `left=${left}`,
        `top=${top}`
    ].join(",");
}
export class VarHub extends TypedEventTarget<VarHubEvents> {
    #serverUrl: URL;

    constructor(serverUrl: string) {
        super();
        this.#serverUrl = new URL(serverUrl, document.baseURI);
    }

    getServerUrl(): string{
        return this.#serverUrl.href;
    }

    setServerUrl(serverUrl: string): void{
        this.#serverUrl = new URL(serverUrl, document.baseURI);
    }

    async createRoom(roomUrl: string = location.href, popup?: Window): Promise<Room> {
        if (popup === window) throw new Error("can not open popup in current window");
        if (popup && popup.closed) popup = undefined;

        const redirectUrl = new URL(roomUrl, document.baseURI);
        redirectUrl.searchParams.delete("roomId");
        redirectUrl.searchParams.delete("roomOwner");
        const handlerHref = redirectUrl.href;
        const createRoomUrl = new URL("/room/create", this.#serverUrl);
        createRoomUrl.searchParams.set("mode", "popup");
        createRoomUrl.searchParams.set("url", handlerHref);
        if (!popup) popup = window.open("about:blank", "new-room-popup", getDefaultPopupFeatures()) ?? undefined;
        if (!popup) throw new Error("can not open popup");
        const roomData = await this.#waitForPopupRoomInfo(popup, createRoomUrl.href, false);
        return this.joinRoom(roomData.roomId, popup);
    }

    async joinRoom(roomId: string, withPopup?: Window|boolean): Promise<Room> {
        if (withPopup === window) throw new Error("can not open popup in current window");
        let popup: Window|undefined = undefined;
        if (withPopup && typeof withPopup !== "boolean") popup = withPopup;
        if (withPopup === true) popup = window.open("about:blank", "new-room-popup", getDefaultPopupFeatures()) ?? undefined;
        if (popup && popup.closed) popup = undefined;

        return new Promise((resolve, reject) => {
            const frameUrl = new URL("/room/connect", this.#serverUrl);
            const iframe = document.createElement("iframe");
            iframe.classList.add("varhub-hidden-frame");
            iframe.setAttribute("data-room-id", roomId);
            iframe.style.position = "fixed";
            iframe.style.top = "-1000px";
            iframe.style.left = "-1000px";
            iframe.style.height = "1px";
            iframe.style.width = "1px";
            document.body.append(iframe);
            const messageListener = async (event) => {
                if (event.source !== iframe.contentWindow) return;
                window.removeEventListener("message", messageListener);
                try {
                    const [method, success, roomInfoOrMessage] = event.data;
                    if (method !== "init") return reject(new Error("protocol error"));
                    if (!success) {
                        if (roomInfoOrMessage === "NotPermitted") {
                            if (!popup) return reject(new Error("NotPermitted"));
                            const roomUrl = new URL(`/room/${roomId}`, this.#serverUrl);
                            roomUrl.searchParams.set("mode", "popup");
                            const roomInfo = await this.#waitForPopupRoomInfo(popup, roomUrl.href, true);
                            document.body.removeChild(iframe);
                            // ignore catch block
                            return resolve(this.joinRoom(roomInfo.roomId));
                        }
                        return reject(new Error(roomInfoOrMessage));
                    }
                    const room: Room = new Room(iframe, roomInfoOrMessage);
                    const result = this.dispatchEvent(new RoomCreateEvent(room));
                    if (!result) {
                        room.destroy();
                        if (popup && !popup.closed) popup.close();
                        reject(new Error("room cancelled"));
                    }
                    resolve(room);
                } catch (error) {
                    document.body.removeChild(iframe);
                    reject(error);
                } finally {
                    if (popup && !popup.closed) popup.close();
                }
            }
            window.addEventListener("message", messageListener);
            iframe.addEventListener("load", () => {
                iframe.contentWindow?.postMessage(["init", roomId], '*');
            });
            iframe.addEventListener("error", (event) => {
                document.body.removeChild(iframe);
                reject(event.error);
            });
            iframe.addEventListener("abort", () => {
                document.body.removeChild(iframe);
                reject(new Error("aborted"));
            });
            iframe.src = frameUrl.href;
        });
    }

    #waitForPopupRoomInfo = async (popup: Window, href: string, closePopupOnSuccess = false): Promise<RoomInfo> => {
        return await new Promise(async (resolve, reject) => {
            const stablePopup = popup;
            if (!stablePopup) return reject(new Error("failed to open popup"));
            const onMessage = async (event: MessageEvent): Promise<void> => {
                if (event.source !== stablePopup) return;
                try {
                    const [type, data] = event.data;
                    if (type === "roomInfoError") {
                        stop(true);
                        return reject(String(data));
                    }
                    if (type !== "roomInfo") return;
                    stop(closePopupOnSuccess);
                    return resolve(data as RoomInfo);
                } catch (error) {
                    stop(true);
                    return reject(error);
                }
            }
            const stop = (closePopup: boolean) => {
                window.removeEventListener("message", onMessage);
                if (!stablePopup.closed && closePopup) stablePopup.close();
            }
            window.addEventListener("message", onMessage)
            stablePopup.location.replace(href);
            await watchForCloseWindow(stablePopup);
            stop(true);
            return reject(new Error("popup closed with no data"));
        })

    }

}

function watchForCloseWindow(popup: Window): Promise<any> {
    if (popup.closed) return Promise.resolve(true);
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(interval);
                resolve(true);
            }
        }, 200);
    })
}
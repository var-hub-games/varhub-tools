import {Room} from "./Room";
import {TypedEventTarget} from "./TypedEventTarget";
import {RoomCreateEvent} from "./events/VarHubEvents";

type VarHubEvents = {
    "roomCreate": RoomCreateEvent
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

    createRoom(roomUrl: string = location.href, state?: string): void{
        location.href = this.getRoomCreateUrl(roomUrl, state);
    }

    getRoomCreateUrl(roomUrl: string = location.href, state?: string): string{
        const redirectUrl = new URL(roomUrl, document.baseURI);
        redirectUrl.searchParams.delete("roomId");
        redirectUrl.searchParams.delete("roomOwner");
        const handlerHref = redirectUrl.href;
        const createRoomUrl = new URL("/room/create", this.#serverUrl);
        createRoomUrl.searchParams.set("url", handlerHref);
        if (state != undefined) createRoomUrl.searchParams.set("state", state);
        return createRoomUrl.href;
    }

    async joinRoom(roomId: string, state?: string): Promise<Room> {
        return new Promise((resolve, reject) => {
            const frameUrl = new URL("/room/connect", this.#serverUrl);
            const iframe = document.createElement("iframe");
            iframe.classList.add("varhub-hidden-frame");
            iframe.id = "varhub-hidden-iframe-room-"+roomId;
            iframe.style.position = "fixed";
            iframe.style.top = "-1000px";
            iframe.style.left = "-1000px";
            iframe.style.height = "1px";
            iframe.style.width = "1px";
            document.body.append(iframe);
            const messageListener = event => {
                console.log("GET EVENT", event)
                if (event.source !== iframe.contentWindow) return;
                window.removeEventListener("message", messageListener);
                try {
                    const [method, success, roomInfoOrMessage] = event.data;
                    if (method !== "init") return reject(new Error("protocol error"));
                    if (!success) {
                        if (roomInfoOrMessage === "NotPermitted") {
                            const roomUrl = new URL(`/room/${roomId}`, this.#serverUrl);
                            if (state != undefined) roomUrl.searchParams.set("state", state);
                            location.href = roomUrl.href;
                        }
                        return reject(new Error(roomInfoOrMessage));
                    }
                    const room: Room = new Room(iframe, roomInfoOrMessage);
                    const result = this.dispatchEvent(new RoomCreateEvent(room));
                    if (!result) {
                        room.destroy();
                        reject(new Error("room cancelled"));
                    }
                    resolve(room);
                } catch (error) {
                    document.body.removeChild(iframe);
                    reject(error);
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
}
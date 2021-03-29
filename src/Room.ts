import { createStore } from "redux";
import {ConnectionInfo, Door, HubAccount, MessageData, RoomOnlineInfo, DoorMode, RoomStateChangeEvent} from "./types";
import {
    RoomMessageEvent,
    RoomConnectEvent,
    RoomDestroyEvent,
    RoomDisconnectEvent,
    RoomEnterEvent,
    RoomErrorEvent,
    RoomJoinEvent,
    RoomKnockEvent,
    RoomLeaveEvent
} from "./events/RoomEvents";
import {TypedEventTarget} from "./TypedEventTarget";
import {Connection} from "./Connection";
import {reduceRoomData} from "./ReduceRoomData";

const decoder = new TextDecoder();

export interface MethodCaller {
    (name: string, ...params: any): Promise<any>,
    (name: number, param: ArrayBuffer): Promise<any>,
}

type RoomEvents = {
    "destroy": RoomDestroyEvent
    "error": RoomErrorEvent
    "connect": RoomDisconnectEvent
    "enter": RoomConnectEvent
    "disconnect": RoomDisconnectEvent
    "join": RoomJoinEvent
    "knock": RoomKnockEvent
    "message": RoomMessageEvent
}
export class Room extends TypedEventTarget<RoomEvents> {
    readonly #iframe: HTMLIFrameElement
    readonly #contentWindow: Window;
    #connectionInfo: ConnectionInfo | null;
    #connections: Map<string, Connection>|null;
    #roomId: string;
    #handlerUrl: string;
    #owned: boolean;
    #connected: boolean = false;
    #resource: string|null = null;
    #destroyed: boolean = false;
    #store = createStore(reduceRoomData);
    #door: Door|null = null;

    #windowMessageListener = (event: MessageEvent) => {
        if (event.source !== this.#contentWindow) return;
        const [method, data, errorMessage] = Array.from(event.data);
        if (method === "connect") return this.#onConnect(data, errorMessage);
        if (method === "msg") return this.#onMsg(data);
        if (method === "disconnect") return this.#onDisconnect(data);
        if (method === "error") return this.#onError(data);
    }

    constructor(iframe: HTMLIFrameElement, roomInfo) {
        super();
        this.#roomId = roomInfo.roomId;
        this.#owned = roomInfo.owned;
        this.#handlerUrl = roomInfo.handlerUrl;
        this.#iframe = iframe;
        const contentWindow = iframe.contentWindow;
        if (!contentWindow) throw new Error("iframe error: no content window");
        this.#contentWindow = contentWindow;
        window.addEventListener("message", this.#windowMessageListener);
    }

    get connected(): boolean {
        return this.#connected;
    }

    get owned(): boolean {
        return this.#owned;
    }

    get id(): string {
        return this.#roomId;
    }

    get connectionId(): string|null {
        return this.#connectionInfo?.id ?? null;
    }

    get name(): string|null {
        return this.#connectionInfo?.account?.name ?? null;
    }

    get state(): any {
        return this.#store.getState();
    }

    #sendData = (method: "init"|"msg"|"connect"|"disconnect", data: any) => {
        this.#contentWindow.postMessage([method, data], "*");
    }

    #eventTargetConnect = new EventTarget();
    #onConnect = (success: boolean, errorMessageOrRole: string) => {
        this.#connected = success;
        this.#eventTargetConnect.dispatchEvent(new CustomEvent("connectResult", {
            cancelable: false,
            bubbles: false,
            detail: { success: success, message: errorMessageOrRole},
        }));
        if (success) this.dispatchEvent(new RoomConnectEvent(this));
    }

    #onDisconnect = (message: string) => {
        this.#resource = null;
        this.#connected = false;
        this.#connectionInfo = null;
        if (this.#connections) {
            this.#connections.clear();
            this.#connections = null;
        }
        this.dispatchEvent(new RoomDisconnectEvent(message));
    }

    #onError = (error) => {
        this.dispatchEvent(new RoomErrorEvent(error));
    }


    #onMsg = (message: string | ArrayBuffer) => {
        if (typeof message === "string") {
            const [header, data] = message.split('\n');
            const eventData = data ? JSON.parse(data) : undefined;
            if (header.startsWith("R ") || header.startsWith("E ")) {
                const success = header.startsWith("R");
                const responseId = header.substring(2);
                return this.#onMethodResponse(success, responseId, eventData);
            }
            if (header === "ConnectionInfoEvent") return this.#onConnectionInfoEvent(eventData);
            if (header === "RoomInfoEvent") return this.#onRoomInfoEvent(eventData);
            if (header === "UserKnockEvent") return this.#onUserKnockEvent(eventData);
            if (header === "UserJoinEvent") return this.#onUserJoinEvent(eventData);
            if (header === "UserLeaveEvent") return this.#onUserLeaveEvent(eventData);
            if (header === "RoomStateChangedEvent") return this.#onRoomStateChangedEvent(eventData);
            if (header === "MessageEvent") return this.#onMessageEvent(eventData);
        } else {
            const uint32 = new Uint32Array(message, 0, 8);
            const eventId = uint32[0];
            if (eventId === 0x00004000 || eventId === 0x00004040) {
                const success = eventId === 0x00004000;
                const responseId = String(eventId[1]);
                const responseData = message.slice(8);
                return this.#onMethodResponse(success, responseId, responseData);
            }
            if (eventId === 0x00002000) return this.#onBinaryMessageEvent(message.slice(4));
        }
    }

    #eventTargetMethodResult = new EventTarget();
    #getNextResponseId: () => number = ((i) => () => ++i)(0)
    #onMethodResponse = (success: boolean, responseId: string, data: any) => {
        this.#eventTargetMethodResult.dispatchEvent(new CustomEvent(responseId, {
            detail: { success , data: JSON.parse(data) }
        }));
    }

    #callMethod: MethodCaller = async (nameOrId, ...params): Promise<any> => {
        if (typeof nameOrId === "string") {
            return new Promise((resolve, reject) => {
                const responseId = String(this.#getNextResponseId());
                const message = [
                    nameOrId,
                    responseId,
                    ...params.map(param => JSON.stringify(param))
                ].join('/n');
                this.#eventTargetMethodResult.addEventListener(responseId, (event: CustomEvent) => {
                    const { success , data } = event.detail;
                    (success ? resolve : reject)(data);
                }, {once: true});
                this.#sendData("msg", message);
            });
        } else {
            const messageBuffer: ArrayBuffer = params[0];
            const responseId = this.#getNextResponseId();
            const header = Uint32Array.of(nameOrId, responseId).buffer;
            const headerBytes = new Uint8Array(header);
            const messageBytes = new Uint8Array(messageBuffer);
            const resultBytes = new Uint8Array(headerBytes.length + messageBytes.length);
            resultBytes.set(headerBytes);
            resultBytes.set(resultBytes, headerBytes.length)
            this.#sendData("msg", resultBytes.buffer);
        }
    }

    #onConnectionInfoEvent = (connectionInfo: ConnectionInfo) => {
        this.#connectionInfo = connectionInfo;
    }

    #onRoomInfoEvent = (roomOnlineInfo: RoomOnlineInfo) => {
        this.#roomId = roomOnlineInfo.roomId;
        this.#handlerUrl = roomOnlineInfo.handlerUrl;
        this.#owned = roomOnlineInfo.owned;
        this.#door = roomOnlineInfo.door;
        const isNewConnection = !this.#connections;
        this.#connections = this.#connections || new Map();

        const userIdSet = new Set<string>();
        for (let user of roomOnlineInfo.users) {
            this.#updateConnection(user);
            userIdSet.add(user.id);
        }
        for (const userId of new Set(this.#connections.keys())) {
            if (!userIdSet.has(userId)) this.#deleteConnection(userId);
        }
        if (isNewConnection) {
            this.dispatchEvent(new RoomEnterEvent(this));
        }
    }

    #onUserKnockEvent = (account: HubAccount) => {
        this.dispatchEvent(new RoomKnockEvent(account));
    }

    #onUserJoinEvent = (connectionInfo: ConnectionInfo) => {
        this.#updateConnection(connectionInfo);
        if (!this.#connections) return;
        const connection = this.#connections.get(connectionInfo.id);
        if (!connection) return;
        this.dispatchEvent(new RoomJoinEvent(connection));
    }

    #onUserLeaveEvent = (connectionInfo: ConnectionInfo) => {
        if (!this.#connections) return;
        const connection = this.#connections.get(connectionInfo.id);
        if (!connection) return;
        this.#connections.delete(connectionInfo.id);
        this.dispatchEvent(new RoomLeaveEvent(connection));
    }

    #onRoomStateChangedEvent = (roomStateChange: RoomStateChangeEvent) => {
        this.#store.dispatch({
            type: "update",
            data: roomStateChange.data,
            path: roomStateChange.path
        });
    }

    #onMessageEvent = ({from, message}: MessageData) => {
        this.#onMessage(from, message);
    }

    #onBinaryMessageEvent = (binaryMessageData: ArrayBuffer) => {
        const len = new Uint32Array(binaryMessageData, 0, 1)[0];
        let from: string|null = null;
        let message: ArrayBuffer;
        if (len < 0) {
            message = binaryMessageData.slice(4);
        } else {
            const nameData = binaryMessageData.slice(4, len);
            from = decoder.decode(nameData);
            message = binaryMessageData.slice(4 + len);
        }
        this.#onMessage(from, message);
    }

    #onMessage = (from: string|null, message: any) => {
        let connection: Connection|null = null;
        if (from) {
            connection = this.getConnection(from);
            if (!connection) {
                console.error("VarHub", "message from unknown id", from, message);
                throw new Error("message from unknown id");
            }
        }
        this.dispatchEvent(new RoomMessageEvent({from: connection, message: message}))
        const eventTarget = connection ? this.#connectionMessageEventTargetMap.get(connection) : null;
        if (eventTarget) {
            eventTarget.dispatchEvent(new CustomEvent("message", {detail: message}))
        }
    }

    #connectionInfoMap = new WeakMap<Connection, ConnectionInfo>()
    #connectionMessageEventTargetMap = new WeakMap<Connection, EventTarget>()
    #updateConnection = (connectionInfo: ConnectionInfo) => {
        this.#connections = this.#connections || new Map();
        const id = connectionInfo.id;
        const existsConnection = this.#connections.get(id);
        if (existsConnection) {
            const existsConnectionInfo = this.#connectionInfoMap.get(existsConnection);
            if (existsConnectionInfo) Object.assign(existsConnectionInfo, connectionInfo);
        } else {
            const current = this.#connectionInfo?.id === connectionInfo.id;
            const msgTarget = new EventTarget();
            const connection = new Connection(this, connectionInfo, current, this.#callMethod, msgTarget);
            this.#connectionMessageEventTargetMap.set(connection, msgTarget);
            this.#connectionInfoMap.set(connection, connectionInfo);
            this.#connections.set(id, connection);
        }
    }

    #deleteConnection = (connectionId: string) => {
        if (!this.#connections) return;
        this.#connections.delete(connectionId);
    }

    async connect<T extends string>(resource: T): Promise<T> {
        if (this.connected) throw new Error("already connected");
        return new Promise((resolve, reject) => {
            this.#eventTargetConnect.addEventListener("connectResult", (event: CustomEvent) => {
                const { success, message } = event.detail;
                if (success) {
                    this.#resource = message;
                    resolve(resource);
                } else {
                    reject(new Error(message));
                }
            }, {once: true});
            this.#sendData("connect", resource);
        });
    }

    async broadcast(message: string|ArrayBuffer, service = false): Promise<void> {
        if (service && !this.owned) throw new Error("not permitted");
        if (typeof message === "string") {
            return await this.#callMethod("SendMessage", null, service, message);
        } else {
            // [4(-1), 1(service), N(message)]
            const messageBytes = new Uint8Array(message);
            const userCountBytes = new Uint8Array(Uint32Array.of(-1).buffer);
            const dataBytes = new Uint8Array(5 + messageBytes.length);
            const serviceBytes = Uint8Array.of( service ? 1 : 0);
            dataBytes.set(userCountBytes, 0);
            dataBytes.set(serviceBytes, 4);
            dataBytes.set(dataBytes, 5);
            return await this.#callMethod(0x00002001, dataBytes.buffer);
        }
    }

    getConnections(): Map<string, Connection> {
        const connections = this.#connections;
        if (!connections) return new Map();
        return new Map(connections.entries());
    }

    getConnection(id: string): null | Connection {
        const connections = this.#connections;
        if (!connections) return null;
        return connections.get(id) ?? null;
    }

    selectConnections(selector?: ConnectionSelector): Map<string, Connection> {
        if (!selector) return this.getConnections();
        const connections = this.#connections;
        const result = new Map<string, Connection>();
        if (!connections) return result;
        for (const [id, connection] of connections.entries()) {
            if (selector.name !== undefined && selector.name !== connection.name ) continue;
            if (selector.accountId !== undefined && selector.accountId !== connection.accountId ) continue;
            if (selector.connectionId !== undefined && selector.connectionId !== id ) continue;
            if (selector.current !== undefined && selector.current !== connection.current ) continue;
            result.set(id, connection);
        }
        return result;
    }

    destroy = () => {
        this.#destroyed = true;
        window.removeEventListener("message", this.#windowMessageListener);
        document.body.removeChild(this.#iframe);
        this.dispatchEvent(new RoomDestroyEvent(this));
    }

    async allow(accountId: string): Promise<void> {
        return await this.#callMethod("SetAccess", accountId, "allow");
    }

    async ban(accountId: string): Promise<void> {
        return await this.#callMethod("SetAccess", accountId, "block");
    }

    get allowList(): string[] | null {
        const door = this.#door;
        return door ? door.allowlist.slice(0) : null
    }

    get blockList(): string[] | null {
        const door = this.#door;
        return door ? door.blocklist.slice(0) : null
    }

    get doorMode(): DoorMode | null {
        const door = this.#door;
        return door ? door.mode : null
    }

    get store(){
        return this.#store;
    }
}

interface ConnectionSelector {
    connectionId?: string
    accountId?: string
    name?: string
    current?: boolean

}
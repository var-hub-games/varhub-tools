import stableStringify from "json-stable-stringify";
import CRC32 from "crc-32";
import {ConnectionInfo, DoorData, MessageData, RoomOnlineInfo, RoomStateChangeData} from "./types";
import {
    RoomMessageEvent,
    RoomConnectEvent,
    RoomDestroyEvent,
    RoomDisconnectEvent,
    RoomEnterEvent,
    RoomErrorEvent,
    RoomJoinEvent,
    RoomConnectionInfoEvent,
    RoomLeaveEvent,
    RoomSyncTimeEvent,
    RoomDoorUpdateEvent,
    RoomStateChangeEvent
} from "./events/RoomEvents";
import {TypedEventTarget} from "./TypedEventTarget";
import {Connection} from "./Connection";
import {reduceRoomState} from "./ReduceRoomState";
import {selectRoomState} from "./SelectRoomState";
import {Door} from "./Door";

const decoder = new TextDecoder();
const TypedArray = Object.getPrototypeOf(Uint8Array);

export interface MethodCaller {
    (name: string, ...params: any): Promise<any>,
    (name: number, param: ArrayBuffer): Promise<any>,
}

export type RoomEvents = {
    "destroy": RoomDestroyEvent
    "error": RoomErrorEvent
    "connect": RoomDisconnectEvent
    "enter": RoomConnectEvent
    "disconnect": RoomDisconnectEvent
    "join": RoomJoinEvent
    "leave": RoomLeaveEvent
    "message": RoomMessageEvent
    "doorUpdate": RoomDoorUpdateEvent
    "stateChange": RoomStateChangeEvent
    "connectionInfo": RoomConnectionInfoEvent
    "syncTime": RoomSyncTimeEvent
}
export class Room extends TypedEventTarget<RoomEvents> {
    readonly #iframe: HTMLIFrameElement
    readonly #contentWindow: Window;
    readonly #connections: Map<string, Connection> = new Map();
    readonly #door: Door;
    readonly #doorTarget = new EventTarget();
    #connectionInfo: ConnectionInfo | null;
    #roomId: string;
    #handlerUrl: string;
    #owned: boolean;
    #connected: boolean = false;
    #entered: boolean = false;
    #resource: string|null = null;
    #destroyed: boolean = false;
    #roomStartDiffAccuracyMs: number = Infinity;
    #roomStartDiffMs: null|number = 0;
    #state = null;
    #connecting = false;

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
        this.#door = new Door(this, this.#callMethod, this.#doorTarget);
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

    get door(): Door {
        return this.#door;
    }

    get state(): any {
        return this.#state;
    }

    get entered(): boolean {
        return this.#entered;
    }

    get destroyed(): boolean {
        return this.#destroyed;
    }

    get resource(): string|null {
        return this.#resource
    }

    get roomStartDiffMs(): null|number {
        return this.#roomStartDiffMs;
    }
    get roomStartDiffAccuracyMs(): number {
        return this.#roomStartDiffAccuracyMs;
    }

    get connecting(): boolean {
        return this.#connecting;
    }

    getTimeLeft(timerValueMs: number): number {
        return timerValueMs - performance.now() + (this.roomStartDiffMs??0);
    }

    createTimer(timeoutValueMs: number): number {
        return performance.now() - (this.roomStartDiffMs??0) + timeoutValueMs;
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
        this.#entered = false;
        this.#roomStartDiffMs = null;
        this.#roomStartDiffAccuracyMs = Infinity;
        this.#connections.clear();
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
            if (header === "DoorChangedEvent") return this.#onDoorChangedEvent(eventData);
            if (header === "UserJoinEvent") return this.#onUserJoinEvent(eventData);
            if (header === "UserLeaveEvent") return this.#onUserLeaveEvent(eventData);
            if (header === "RoomStateChangedEvent") return this.#onRoomStateChangedEvent(eventData);
            if (header === "MessageEvent") return this.#onMessageEvent(eventData);
        } else {
            const uint32 = new Uint32Array(message, 0, 1);
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
            detail: { success , data }
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
                ].join('\n');
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
            console.log({header, headerBytes, messageBytes, resultBytes});
            resultBytes.set(headerBytes);
            resultBytes.set(messageBytes, headerBytes.length)
            this.#sendData("msg", resultBytes.buffer);
        }
    }

    #onConnectionInfoEvent = (connectionInfo: ConnectionInfo) => {
        const roomStartDiffMs = performance.now() - connectionInfo.syncTimeMs;
        this.#roomStartDiffMs = roomStartDiffMs;
        this.#roomStartDiffAccuracyMs = Infinity;
        this.#connectionInfo = connectionInfo;
        this.dispatchEvent(new RoomSyncTimeEvent(roomStartDiffMs));
        this.dispatchEvent(new RoomConnectionInfoEvent(this));
    }

    #onRoomInfoEvent = (roomOnlineInfo: RoomOnlineInfo) => {
        this.#roomId = roomOnlineInfo.roomId;
        this.#handlerUrl = roomOnlineInfo.handlerUrl;
        this.#owned = roomOnlineInfo.owned;
        this.#state = roomOnlineInfo.state;
        const hasEntered = this.#entered;
        this.#entered = true;

        const userIdSet = new Set<string>();
        for (let user of roomOnlineInfo.users) {
            this.#updateConnection(user);
            userIdSet.add(user.id);
        }
        for (const userId of new Set(this.#connections.keys())) {
            if (!userIdSet.has(userId)) this.#deleteConnection(userId);
        }
        if (roomOnlineInfo.door) {
            const updated = this.#doorTarget.dispatchEvent(new CustomEvent("update", {
                detail: roomOnlineInfo.door,
                cancelable: true
            }));
            if (updated) this.dispatchEvent(new RoomDoorUpdateEvent(this.#door));
        }
        if (!hasEntered) {
            this.dispatchEvent(new RoomEnterEvent(this));
        }
    }

    #onDoorChangedEvent = (doorData: DoorData) => {
        const updated = this.#doorTarget.dispatchEvent(new CustomEvent("update", {
            detail: doorData,
            cancelable: true
        }));
        if (updated) this.dispatchEvent(new RoomDoorUpdateEvent(this.#door));
    }

    #onUserJoinEvent = (connectionInfo: ConnectionInfo) => {
        this.#updateConnection(connectionInfo);
        const connection = this.#connections.get(connectionInfo.id);
        if (!connection) return;
        this.dispatchEvent(new RoomJoinEvent(connection));
    }

    #onUserLeaveEvent = (connectionInfo: ConnectionInfo) => {
        const connection = this.#connections.get(connectionInfo.id);
        if (!connection) return;
        this.#connections.delete(connectionInfo.id);
        const eventTarget = this.#connectionMessageEventTargetMap.get(connection);
        if (eventTarget) eventTarget.dispatchEvent(new CustomEvent("leave"));
        this.dispatchEvent(new RoomLeaveEvent(connection));
    }

    #onRoomStateChangedEvent = (event: RoomStateChangeData) => {
        const prevState = this.#state;
        const nextState = reduceRoomState(prevState, event.data, event.path ?? []);
        if (Object.is(prevState, nextState)) return;
        this.#state = nextState;
        this.dispatchEvent(new RoomStateChangeEvent({
            state: nextState,
            prevState: prevState,
            room: this
        }));
    }

    #onMessageEvent = ({from, message}: MessageData) => {
        this.#onMessage(from, message);
    }

    #onBinaryMessageEvent = (binaryMessageData: ArrayBuffer) => {
        const len = new Int32Array(binaryMessageData, 0, 1)[0];
        let from: string|null = null;
        let message: ArrayBuffer;
        if (len < 0) {
            message = binaryMessageData.slice(4);
        } else {
            const nameData = binaryMessageData.slice(4, 4+len);
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
        console.log("::onMessage MSG", typeof message, message);
        this.dispatchEvent(new RoomMessageEvent({from: connection, message: message}))
        const eventTarget = connection ? this.#connectionMessageEventTargetMap.get(connection) : null;
        if (eventTarget) {
            eventTarget.dispatchEvent(new CustomEvent("message", {detail: message}))
        }
    }

    #connectionInfoMap = new WeakMap<Connection, ConnectionInfo>()
    #connectionMessageEventTargetMap = new WeakMap<Connection, EventTarget>()
    #updateConnection = (connectionInfo: ConnectionInfo) => {
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
        this.#connections.delete(connectionId);
    }

    async connect<T extends string>(resource: T): Promise<T> {
        if (this.connected) throw new Error("already connected");
        if (this.#connecting) throw new Error("already connecting");
        return new Promise((resolve, reject) => {
            this.#eventTargetConnect.addEventListener("connectResult", (event: CustomEvent) => {
                const { success, message } = event.detail;
                this.#connecting = false;
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

    async disconnect(reason: string){
        if (!this.connected) return false;
        this.#resource = null;
        this.#connected = false;
        this.#entered = false;
        this.#connecting = false;
        this.#roomStartDiffMs = null;
        this.#roomStartDiffAccuracyMs = Infinity;
        this.#connections.clear();
        this.#sendData("disconnect", reason);
    }

    async broadcast(message: any, service = false): Promise<void> {
        if (service && !this.owned) throw new Error("not permitted");
        if (message instanceof ArrayBuffer || message instanceof TypedArray) {
            // [4(-1), 1(service), N(message)]
            const messageBytes = new Uint8Array("buffer" in message ? message.buffer : message);
            const userCountBytes = new Uint8Array(Int32Array.of(-1).buffer);
            const dataBytes = new Uint8Array(5 + messageBytes.length);
            const serviceBytes = Uint8Array.of(service ? 1 : 0);
            dataBytes.set(userCountBytes, 0);
            dataBytes.set(serviceBytes, 4);
            dataBytes.set(messageBytes, 5);
            return await this.#callMethod(0x00002001, dataBytes.buffer);
        } else {
            return await this.#callMethod("SendMessage", null, service, message);
        }
    }

    async syncTime(): Promise<number> {
        const start = performance.now();
        const roomMs: number = await this.#callMethod("SyncTime");
        const now = performance.now();
        const localDiff = now - start;
        const roomStartDiffMs = now - roomMs - localDiff/2;
        this.#roomStartDiffMs = roomStartDiffMs;
        this.#roomStartDiffAccuracyMs = localDiff;
        this.dispatchEvent(new RoomSyncTimeEvent(roomStartDiffMs));
        return roomStartDiffMs
    }

    getConnections(): Map<string, Connection> {
        return new Map(this.#connections.entries());
    }

    getConnection(id: string): null | Connection {
        return this.#connections.get(id) ?? null;
    }

    selectConnections(selector?: ConnectionSelector): Map<string, Connection> {
        if (!selector) return this.getConnections();
        const result = new Map<string, Connection>();
        for (const [id, connection] of this.#connections.entries()) {
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
        this.#connected = false;
        this.#entered = false;
        this.#connectionInfo = null;
        window.removeEventListener("message", this.#windowMessageListener);
        document.body.removeChild(this.#iframe);
        this.dispatchEvent(new RoomDestroyEvent(this));
    }

    async modifyState(...modifiers: StateModifier[]): Promise<void> {
        if (modifiers.length === 0) return;
        const state = this.#state;
        const modList: StateModifierData[] = modifiers.map(({path, data, ignoreHash}) => {
            const statePart = selectRoomState(state, path ?? []);
            let hash: number|null = null;
            if (!ignoreHash){
                if (statePart === undefined) {
                    hash = 0;
                } else {
                    hash = CRC32.str(stableStringify(statePart));
                }
            }
            return {hash, path, data}
        });
        if (modList.length === 1) {
            const mod = modList[0];
            return await this.#callMethod("ChangeState", mod.path, mod.hash, mod.data);
        } else {
            return await this.#callMethod("BulkChangeState", modList);
        }
    }

    async changeState(data: any, path:(string|number)[]|null = null, ignoreHash = false){
        return await this.modifyState({ignoreHash, data, path});
    }
}

interface ConnectionSelector {
    connectionId?: string
    accountId?: string
    name?: string
    current?: boolean
}

interface StateModifier {
    path: (string|number)[] | null,
    data: any,
    ignoreHash: boolean
}

interface StateModifierData {
    path: (string|number)[] | null,
    data: any,
    hash: number|null
}
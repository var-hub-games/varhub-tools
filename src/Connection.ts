import {ConnectionInfo} from "./types";
import {TypedEventTarget} from "./TypedEventTarget";
import {MethodCaller, Room} from "./Room";
import {ConnectionLeaveEvent, ConnectionMessageEvent} from "./events/ConnectionEvents";

export type ConnectionEvents = {
    "message": ConnectionMessageEvent
}
const encoder = new TextEncoder();
const TypedArray = Object.getPrototypeOf(Uint8Array);

export class Connection extends TypedEventTarget<ConnectionEvents> {
    readonly #room: Room
    readonly #connectionInfo: ConnectionInfo
    readonly #callMethod: MethodCaller
    readonly #current: boolean

    constructor(room: Room, connectionInfo: ConnectionInfo, current: boolean, callMethod: MethodCaller, messageEventTarget: EventTarget) {
        super();
        this.#connectionInfo = connectionInfo;
        this.#room = room;
        this.#callMethod = callMethod;
        this.#current = current;
        messageEventTarget.addEventListener("message", ({detail}: CustomEvent) => {
            this.dispatchEvent(new ConnectionMessageEvent(detail));
        });
        messageEventTarget.addEventListener("leave", (event) => {
            this.dispatchEvent(new ConnectionLeaveEvent(this));
        });
    }

    get current(){
        return this.#current
    }

    get room(): Room{
        return this.#room;
    }

    get id(): string{
        return this.#connectionInfo.id;
    }

    get resource(): string {
        return this.#connectionInfo.resource;
    }

    get accountId(): string{
        return this.#connectionInfo.account.id;
    }

    get name(): string{
        return this.#connectionInfo.account.name;
    }

    async sendMessage(message: any, service = false): Promise<void> {
        if (service && !this.#room.owned) throw new Error("not permitted");
        if (message instanceof ArrayBuffer || message instanceof TypedArray) {
            // [4(1), 4(nameLen), nameLen(name), 1(success), N(message)]
            const messageBytes = new Uint8Array("buffer" in message ? message.buffer : message);
            const userCountBytes = new Uint8Array(Uint32Array.of(1).buffer);
            const userIdBytes = encoder.encode(this.id);
            const userIdLength = userIdBytes.length;
            const userIdLengthBytes = new Uint8Array(Uint32Array.of(userIdLength).buffer);
            const dataBytes = new Uint8Array(9 + userIdLength + messageBytes.length);
            const serviceBytes = Uint8Array.of(service ? 1 : 0);
            dataBytes.set(userCountBytes, 0);
            dataBytes.set(userIdLengthBytes, 4);
            dataBytes.set(userIdBytes, 8);
            dataBytes.set(serviceBytes, 8 + userIdLength);
            dataBytes.set(messageBytes, 9 + userIdLength);
            return await this.#callMethod(0x00002001, dataBytes.buffer);
        } else {
            return await this.#callMethod("SendMessage", [this.id], service, message);
        }
    }

    async ban(): Promise<void> {
        return await this.#callMethod("SetAccess", this.accountId, "block");
    }
}
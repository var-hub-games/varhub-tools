import {Room} from "../Room";
import {Connection} from "../Connection";
import {HubAccount} from "../types";

export class RoomDestroyEvent extends CustomEvent<Room> {
    constructor(room: Room) {
        super("destroy", {bubbles: false, cancelable: false, composed: false, detail: room});
    }
}

export class RoomEnterEvent extends CustomEvent<Room> {
    constructor(room: Room) {
        super("enter", {bubbles: false, cancelable: false, composed: false, detail: room});
    }
}

export class RoomErrorEvent extends CustomEvent<any> {
    constructor(error: any) {
        super("error", {bubbles: false, cancelable: false, composed: false, detail: error});
    }
}

export class RoomConnectEvent extends CustomEvent<Room> {
    constructor(room: Room) {
        super("connect", {bubbles: false, cancelable: false, composed: false, detail: room});
    }
}

export class RoomDisconnectEvent extends CustomEvent<string> {
    constructor(message: string) {
        super("disconnect", {bubbles: false, cancelable: false, composed: false, detail: message});
    }
}

export class RoomJoinEvent extends CustomEvent<Connection> {
    constructor(connection: Connection) {
        super("join", {bubbles: false, cancelable: false, composed: false, detail: connection});
    }
}
export class RoomLeaveEvent extends CustomEvent<Connection> {
    constructor(connection: Connection) {
        super("leave", {bubbles: false, cancelable: false, composed: false, detail: connection});
    }
}
export class RoomKnockEvent extends CustomEvent<HubAccount> {
    constructor(hubAccount: HubAccount) {
        super("knock", {bubbles: false, cancelable: false, composed: false, detail: hubAccount});
    }
}
export class RoomMessageEvent extends CustomEvent<{from: Connection|null, message: string}> {
    constructor(data: {from: Connection|null, message: string}) {
        super("message", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}
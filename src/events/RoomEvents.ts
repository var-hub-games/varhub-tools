import {Room} from "../Room";
import {Connection} from "../Connection";
import {HubAccount} from "../types";
import {Door} from "../Door";

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

export class RoomConnectionInfoEvent extends CustomEvent<Room> {
    constructor(room: Room) {
        super("connectionInfo", {bubbles: false, cancelable: false, composed: false, detail: room});
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
export class RoomMessageEvent extends CustomEvent<{from: Connection|null, message: any}> {
    constructor(data: {from: Connection|null, message: any}) {
        super("message", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class RoomDoorUpdateEvent extends CustomEvent<Door> {
    constructor(data: Door) {
        super("doorUpdate", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class RoomStateChangeEvent extends CustomEvent<{room: Room, state: any, prevState: any}> {
    constructor(data: {room: Room, state: any, prevState: any}) {
        super("stateChange", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}
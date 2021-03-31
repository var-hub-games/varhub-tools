import {Connection} from "../Connection";

export class ConnectionMessageEvent extends CustomEvent<any> {
    constructor(data: any) {
        super("message", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}
export class ConnectionLeaveEvent extends CustomEvent<Connection> {
    constructor(data: Connection) {
        super("leave", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}
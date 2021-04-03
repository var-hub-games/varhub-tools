import {DoorMode, HubAccount} from "../types";
import {Door} from "../Door";

export class DoorKnockEvent extends CustomEvent<HubAccount> {
    constructor(data: HubAccount) {
        super("knock", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class DoorGoneEvent extends CustomEvent<HubAccount> {
    constructor(data: HubAccount) {
        super("gone", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class DoorAllowlistChangedEvent extends CustomEvent<Set<string>> {
    constructor(data: Set<string>) {
        super("allowlistChanged", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class DoorBlocklistChangedEvent extends CustomEvent<Set<string>> {
    constructor(data: Set<string>) {
        super("blocklistChanged", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class DoorKnockChangedEvent extends CustomEvent<Map<string, HubAccount>> {
    constructor(data: Map<string, HubAccount>) {
        super("knockChanged", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}

export class DoorModeChangedEvent extends CustomEvent<DoorMode> {
    constructor(data: DoorMode) {
        super("modeChanged", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}


export class DoorUpdateEvent extends CustomEvent<Door> {
    constructor(data: Door) {
        super("update", {bubbles: false, cancelable: false, composed: false, detail: data});
    }
}
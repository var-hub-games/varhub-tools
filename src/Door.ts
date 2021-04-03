import stableStringify from "json-stable-stringify";
import CRC32 from "crc-32";
import {ConnectionInfo, DoorData, HubAccount, MessageData, RoomOnlineInfo, DoorMode, RoomStateChangeData} from "./types";
import {
    RoomMessageEvent,
    RoomConnectEvent,
    RoomDestroyEvent,
    RoomDisconnectEvent,
    RoomEnterEvent,
    RoomErrorEvent,
    RoomJoinEvent,
    RoomKnockEvent,
    RoomLeaveEvent,
    RoomStateChangeEvent
} from "./events/RoomEvents";
import {TypedEventTarget} from "./TypedEventTarget";
import {Connection} from "./Connection";
import {reduceRoomState} from "./ReduceRoomState";
import {selectRoomState} from "./SelectRoomState";
import {Room} from "./Room";
import {
    DoorAllowlistChangedEvent,
    DoorBlocklistChangedEvent,
    DoorGoneEvent,
    DoorKnockChangedEvent,
    DoorKnockEvent, DoorModeChangedEvent, DoorUpdateEvent
} from "./events/DoorEvents";

export interface MethodCaller {
    (name: string, ...params: any): Promise<any>,
    (name: number, param: ArrayBuffer): Promise<any>,
}

export type DoorEvents = {
    knock: DoorKnockEvent,
    gone: DoorGoneEvent,
    allowlistChanged: DoorAllowlistChangedEvent,
    blocklistChanged: DoorBlocklistChangedEvent,
    knockChanged: DoorKnockChangedEvent,
    modeChanged: DoorModeChangedEvent,
    update: DoorUpdateEvent
}
export class Door extends TypedEventTarget<DoorEvents> {
    #room: Room
    #allowlist: Set<string> = new Set();
    #blocklist: Set<string> = new Set();
    #knock: Map<string, HubAccount> = new Map();
    #mode: DoorMode|null = null;
    #callMethod: MethodCaller;

    constructor(room: Room, callMethod: MethodCaller, target: EventTarget) {
        super();
        this.#room = room;
        this.#callMethod = callMethod;
        target.addEventListener("update", this.#onUpdate);
    }

    get allowList(): Set<string> {
        return new Set(this.#allowlist)
    }

    get blockList(): Set<string> {
        return new Set(this.#blocklist);
    }

    get mode(): DoorMode|null {
        return this.#mode;
    }

    get knock(): Map<string, HubAccount> {
        return new Map(this.#knock.entries());
    }

    #onUpdate = (event: CustomEvent<DoorData>) => {
        let updates = {mode: false, blocklist: false, allowlist: false, knock: false};
        const {mode, knock, allowlist, blocklist} = event.detail;
        const allowlistSet = new Set(allowlist);
        const blocklistSet = new Set(blocklist);

        const knockIdMap = new Map<string, HubAccount>(knock.map(account => [account.id, account]));
        const knockIdListSet = new Set(knockIdMap.keys());
        if (this.#mode !== mode) {
            updates.mode = true;
            this.#mode = mode
        }
        if (!setIsEqual(this.#allowlist, allowlistSet)) {
            updates.allowlist = true;
            this.#allowlist = allowlistSet;
        }
        if (!setIsEqual(this.#blocklist, blocklistSet)) {
            updates.blocklist = true;
            this.#blocklist = blocklistSet;
        }
        const currentKnockIds = new Set(this.#knock.keys());
        const usersToAdd = new Set<HubAccount>();
        const usersToRemove = new Set<HubAccount>();
        if (!setIsEqual(currentKnockIds, knockIdListSet)) {
            updates.knock = true;
            for (const currentKnockId of currentKnockIds) {
                if (!knockIdListSet.has(currentKnockId)) {
                    const userToRemove = this.#knock.get(currentKnockId);
                    if (userToRemove) usersToRemove.add(userToRemove);
                }
            }
            for (const knockId of knockIdListSet) {
                if (!currentKnockIds.has(knockId)) {
                    const userToAdd = knockIdMap.get(knockId);
                    if (userToAdd) usersToRemove.add(userToAdd);
                }
            }
            for (let hubAccount of usersToRemove) {
                this.#knock.delete(hubAccount.id)
            }
            for (let hubAccount of usersToAdd) {
                this.#knock.set(hubAccount.id, Object.freeze(hubAccount));
            }
            this.#blocklist = blocklistSet;
        }

        const updated = updates.knock || updates.mode || updates.allowlist || updates.blocklist;
        for (let hubAccount of usersToAdd) {
            this.dispatchEvent(new DoorKnockEvent(hubAccount))
        }
        for (let hubAccount of usersToRemove) {
            this.dispatchEvent(new DoorGoneEvent(hubAccount))
        }
        if (updates.knock) {
            this.dispatchEvent(new DoorKnockChangedEvent(this.knock));
        }
        if (updates.mode) {
            const mode = this.mode
            if (mode) this.dispatchEvent(new DoorModeChangedEvent(mode));
        }
        if (updates.allowlist) {
            this.dispatchEvent(new DoorAllowlistChangedEvent(this.allowList))
        }
        if (updates.blocklist) {
            this.dispatchEvent(new DoorBlocklistChangedEvent(this.blockList))
        }
        if (updated) {
            this.dispatchEvent(new DoorUpdateEvent(this));
        }
        if (updated) event.preventDefault();
    }

    async allow(accountId: string): Promise<void> {
        return await this.#callMethod("SetAccess", accountId, "allow");
    }

    async block(accountId: string): Promise<void> {
        return await this.#callMethod("SetAccess", accountId, "block");
    }
}

function setIsEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false;
    for (let value of set1) {
        if (!set2.has(value)) return false;
    }
    return true;
}
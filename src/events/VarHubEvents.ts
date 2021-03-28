import {Room} from "../Room";

export class RoomCreateEvent extends CustomEvent<Room> {

    constructor(room: Room) {
        super("roomCreate", {bubbles: false, cancelable: false, composed: false, detail: room});
    }
}
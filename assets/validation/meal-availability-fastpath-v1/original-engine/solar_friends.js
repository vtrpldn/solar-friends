let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

const GameFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_game_free(ptr >>> 0, 1));

export class Game {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GameFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_game_free(ptr, 0);
    }
    /**
     * @param {number} order
     * @param {number} resident
     * @returns {string}
     */
    collect_order(order, resident) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_collect_order(this.__wbg_ptr, order, resident);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} data
     * @param {number} resident
     * @returns {string}
     */
    order_supplies_pickup(data, resident) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_order_supplies_pickup(this.__wbg_ptr, ptr0, len0, resident);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} index
     * @returns {string}
     */
    clear_source(index) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_clear_source(this.__wbg_ptr, index);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} material
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    place_source(material, x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_place_source(this.__wbg_ptr, material, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} index
     * @returns {string}
     */
    harvest_source(index) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_harvest_source(this.__wbg_ptr, index);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} index
     * @returns {string}
     */
    replant_source(index) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_replant_source(this.__wbg_ptr, index);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} index
     * @param {boolean} replant
     * @param {boolean} harvest
     * @returns {string}
     */
    configure_source(index, replant, harvest) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_configure_source(this.__wbg_ptr, index, replant, harvest);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * No command is sent to the live village. Dates assume that the player
     * keeps current plans, schedules and requests and makes no new purchases.
     * @param {number} days
     * @returns {string}
     */
    project_forecast(days) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_project_forecast(this.__wbg_ptr, days);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    scenario_setup_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_scenario_setup_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} auto_feed
     * @param {boolean} filter_water
     * @param {boolean} use_biogas
     */
    configure_sanitation(auto_feed, filter_water, use_biogas) {
        wasm.game_configure_sanitation(this.__wbg_ptr, auto_feed, filter_water, use_biogas);
    }
    /**
     * @param {boolean} enabled
     */
    configure_banana_treatment(enabled) {
        wasm.game_configure_banana_treatment(this.__wbg_ptr, enabled);
    }
    /**
     * @returns {string}
     */
    agriculture_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_agriculture_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {boolean} enabled
     * @returns {boolean}
     */
    configure_agriculture(id, enabled) {
        const ret = wasm.game_configure_agriculture(this.__wbg_ptr, id, enabled);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @param {boolean} requested
     * @returns {boolean}
     */
    request_animal_stocking(id, requested) {
        const ret = wasm.game_request_animal_stocking(this.__wbg_ptr, id, requested);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    electricity_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_electricity_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Canonical map masks for renderers and editor overlays. Callers should
     * sample these when authored geometry changes, not on pointer movement.
     * @returns {string}
     */
    world_geometry() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_world_geometry(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    crop_outlook(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_crop_outlook(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    restore_plot(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_restore_plot(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_restoration(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_restoration(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    restoration_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_restoration_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    restoration_preview(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_restoration_preview(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    story_outcomes_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_story_outcomes_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} from_x
     * @param {number} from_y
     * @param {number} to_x
     * @param {number} to_y
     * @returns {string}
     */
    route_quote(from_x, from_y, to_x, to_y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_route_quote(this.__wbg_ptr, from_x, from_y, to_x, to_y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Run the real chooser on a copy, and the same refusal rules used by requests.
     * @returns {string}
     */
    dev_inspect() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_dev_inspect(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    dev_observe(enabled) {
        wasm.game_dev_observe(this.__wbg_ptr, enabled);
    }
    /**
     * Commit only after the entire definition has compiled successfully.
     * @param {string} data
     * @returns {string}
     */
    load_scenario(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_load_scenario(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    story_opening() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_story_opening(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    scenario_catalog() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_scenario_catalog(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    scenario_journal() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_scenario_journal(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} data
     * @param {boolean} distribute
     * @returns {string}
     */
    scenario_liquids(data, distribute) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_liquids(this.__wbg_ptr, ptr0, len0, distribute);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    terrain_template() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_terrain_template(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} seed
     * @returns {string}
     */
    generate_property(seed) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_generate_property(this.__wbg_ptr, seed);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} data
     * @param {boolean} distribute
     * @returns {string}
     */
    scenario_supplies(data, distribute) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_supplies(this.__wbg_ptr, ptr0, len0, distribute);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * A reusable authoring document. This is not a playable save file.
     * @param {string} mode
     * @returns {string}
     */
    scenario_template(mode) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_template(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} data
     * @returns {string}
     */
    validate_scenario(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_validate_scenario(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} data
     * @returns {string}
     */
    validate_map_package(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_validate_map_package(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} biome
     * @param {number} seed
     * @returns {string}
     */
    generate_biome_property(biome, seed) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(biome, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_generate_biome_property(this.__wbg_ptr, ptr0, len0, seed);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    continue_scenario_freely() {
        const ret = wasm.game_continue_scenario_freely(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} raw
     * @param {boolean} unrestricted
     * @returns {string}
     */
    validate_resident_preset(raw, unrestricted) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(raw, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_validate_resident_preset(this.__wbg_ptr, ptr0, len0, unrestricted);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    work_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_work_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} resident
     * @param {string} category
     * @param {number} level
     * @returns {string}
     */
    set_work_preference(resident, category, level) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(category, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_set_work_preference(this.__wbg_ptr, resident, ptr0, len0, level);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} raw
     * @param {string} kind
     * @param {string} from
     * @param {string} to
     * @returns {string}
     */
    scenario_route_preview(raw, kind, from, to) {
        let deferred5_0;
        let deferred5_1;
        try {
            const ptr0 = passStringToWasm0(raw, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(from, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ptr3 = passStringToWasm0(to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len3 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_route_preview(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
            deferred5_0 = ret[0];
            deferred5_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
        }
    }
    /**
     * @param {string} raw
     * @param {string} kind
     * @returns {string}
     */
    scenario_utility_endpoints(raw, kind) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(raw, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_utility_endpoints(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    skills_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_skills_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_resident_learning(enabled) {
        wasm.game_set_resident_learning(this.__wbg_ptr, enabled);
    }
    /**
     * @returns {string}
     */
    sandbox_rules_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_sandbox_rules_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Keep owned property, paid lines and work in progress when changing rules.
     * @param {boolean} logistics
     * @param {boolean} land
     * @param {boolean} utilities
     * @returns {boolean}
     */
    configure_sandbox_rules(logistics, land, utilities) {
        const ret = wasm.game_configure_sandbox_rules(this.__wbg_ptr, logistics, land, utilities);
        return ret !== 0;
    }
    /**
     * @param {string} raw
     * @returns {string}
     */
    scenario_equipment(raw) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(raw, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_scenario_equipment(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Starts a fresh mode; invalid input leaves the running village untouched.
     * @param {string} mode
     * @returns {boolean}
     */
    start_mode(mode) {
        const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.game_start_mode(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @returns {boolean}
     */
    remove_sandbox_building(id) {
        const ret = wasm.game_remove_sandbox_building(this.__wbg_ptr, id);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_order(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_order(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} n
     * @returns {string}
     */
    sell_surplus(n) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_sell_surplus(this.__wbg_ptr, n);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} material
     * @param {number} n
     * @returns {string}
     */
    sell_material(material, n) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_sell_material(this.__wbg_ptr, material, n);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_project(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_project(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    exchange_parts() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_exchange_parts(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} data
     * @returns {string}
     */
    order_supplies(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_order_supplies(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} index
     * @returns {string}
     */
    restore_source(index) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_restore_source(this.__wbg_ptr, index);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Existing scenario helpers enable Nina's job; players use individual toggles.
     * @param {boolean} enabled
     */
    set_outside_work(enabled) {
        wasm.game_set_outside_work(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} resident
     * @param {boolean} enabled
     * @returns {boolean}
     */
    set_resident_job(resident, enabled) {
        const ret = wasm.game_set_resident_job(this.__wbg_ptr, resident, enabled);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @param {number} priority
     * @param {boolean} paused
     * @param {string} variant
     * @returns {string}
     */
    configure_project(id, priority, paused, variant) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_configure_project(this.__wbg_ptr, id, priority, paused, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    host_gathering() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_host_gathering(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    cancel_gathering() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_gathering(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_help(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_help(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    building_work_quote(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_building_work_quote(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {string} action
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    queue_building_work(id, action, x, y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_queue_building_work(this.__wbg_ptr, id, ptr0, len0, x, y);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_building_work(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_building_work(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    supplier_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_supplier_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} data
     * @param {boolean} pickup
     * @returns {string}
     */
    supply_order_quote(data, pickup) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_supply_order_quote(this.__wbg_ptr, ptr0, len0, pickup);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} data
     * @param {string} token
     * @returns {string}
     */
    order_supplies_quoted(data, token) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(token, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.game_order_supplies_quoted(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_supplier_variation(enabled) {
        wasm.game_set_supplier_variation(this.__wbg_ptr, enabled);
    }
    /**
     * @param {string} data
     * @param {number} resident
     * @param {string} token
     * @returns {string}
     */
    order_supplies_pickup_quoted(data, resident, token) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(token, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.game_order_supplies_pickup_quoted(this.__wbg_ptr, ptr0, len0, resident, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    logistics_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_logistics_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} building
     * @param {string} items
     * @returns {string}
     */
    set_storage_target(building, items) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(items, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_set_storage_target(this.__wbg_ptr, building, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    maintenance_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_maintenance_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_automatic_service(enabled) {
        wasm.game_set_automatic_service(this.__wbg_ptr, enabled);
    }
    /**
     * @param {string} data
     * @returns {string}
     */
    queue_equipment_service(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_queue_equipment_service(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     */
    set_equipment_condition(enabled) {
        wasm.game_set_equipment_condition(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} id
     * @returns {boolean}
     */
    cancel_equipment_service(id) {
        const ret = wasm.game_cancel_equipment_service(this.__wbg_ptr, id);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @param {boolean} paused
     * @returns {boolean}
     */
    configure_equipment_service(id, paused) {
        const ret = wasm.game_configure_equipment_service(this.__wbg_ptr, id, paused);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    water_connections() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_water_connections(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @param {number} from
     * @param {number} to
     * @returns {string}
     */
    queue_water_connection(kind, from, to) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_queue_water_connection(this.__wbg_ptr, ptr0, len0, from, to);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @param {number} from
     * @param {number} to
     * @returns {string}
     */
    water_connection_quote(kind, from, to) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_water_connection_quote(this.__wbg_ptr, ptr0, len0, from, to);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    remove_water_connection(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_remove_water_connection(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {number} priority
     * @param {boolean} paused
     * @returns {string}
     */
    configure_water_connection(id, priority, paused) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_configure_water_connection(this.__wbg_ptr, id, priority, paused);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} from
     * @param {number} to
     * @returns {string}
     */
    electrical_connection_quote(from, to) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_electrical_connection_quote(this.__wbg_ptr, from, to);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} from
     * @param {number} to
     * @returns {string}
     */
    queue_electrical_connection(from, to) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_queue_electrical_connection(this.__wbg_ptr, from, to);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    remove_electrical_connection(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_remove_electrical_connection(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {number} priority
     * @param {boolean} paused
     * @returns {string}
     */
    configure_electrical_connection(id, priority, paused) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_configure_electrical_connection(this.__wbg_ptr, id, priority, paused);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    weather_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_weather_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {boolean} enabled
     * @returns {boolean}
     */
    set_seasons_enabled(enabled) {
        const ret = wasm.game_set_seasons_enabled(this.__wbg_ptr, enabled);
        return ret !== 0;
    }
    /**
     * @param {number} bank
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    battery_move_quote(bank, x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_battery_move_quote(this.__wbg_ptr, bank, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} bank
     * @param {string} action
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    queue_battery_work(bank, action, x, y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_queue_battery_work(this.__wbg_ptr, bank, ptr0, len0, x, y);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_battery_work(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_battery_work(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} bank
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    battery_plot_available(bank, x, y) {
        const ret = wasm.game_battery_plot_available(this.__wbg_ptr, bank, x, y);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    simulation_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_simulation_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} seed
     * @returns {boolean}
     */
    set_simulation_seed(seed) {
        const ret = wasm.game_set_simulation_seed(this.__wbg_ptr, seed);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    land_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_land_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    land_preview(kind, x, y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_land_preview(this.__wbg_ptr, ptr0, len0, x, y);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @param {number} from
     * @param {number} to
     * @returns {string}
     */
    utility_preview(kind, from, to) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_utility_preview(this.__wbg_ptr, ptr0, len0, from, to);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @returns {string}
     */
    utility_endpoints(kind) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_utility_endpoints(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} building
     * @param {boolean} paused
     * @returns {string}
     */
    set_process_paused(building, paused) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_set_process_paused(this.__wbg_ptr, building, paused);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_passive_batch(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_passive_batch(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    production_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_production_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {boolean} enabled
     * @returns {string}
     */
    set_workshop_powered(id, enabled) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_set_workshop_powered(this.__wbg_ptr, id, enabled);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {boolean} paused
     * @returns {string}
     */
    set_production_paused(id, paused) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_set_production_paused(this.__wbg_ptr, id, paused);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} material
     * @param {number} n
     * @returns {string}
     */
    set_production_target(material, n) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_set_production_target(this.__wbg_ptr, material, n);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @returns {string}
     */
    cancel_production_batch(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_cancel_production_batch(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    water_report() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_water_report(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {string} name
     * @param {string} preset
     * @param {number} version
     * @returns {boolean}
     */
    change_resident_identity(id, name, preset, version) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(preset, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.game_change_resident_identity(this.__wbg_ptr, id, ptr0, len0, ptr1, len1, version);
        return ret !== 0;
    }
    /**
     * @param {number} id
     * @param {string} name
     * @param {string} raw
     * @returns {boolean}
     */
    change_resident_appearance(id, name, raw) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(raw, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.game_change_resident_appearance(this.__wbg_ptr, id, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * A read-only animation render sample. Full reports and static land stay in snapshot().
     * Never use this partial view as a save file.
     * @returns {string}
     */
    frame_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_frame_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    toggle_road(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_toggle_road(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} quest
     * @returns {boolean}
     */
    track_quest(quest) {
        const ret = wasm.game_track_quest(this.__wbg_ptr, quest);
        return ret !== 0;
    }
    /**
     * Read-only live reports. Frozen authoring content is retained by the view,
     * while saves and exports continue to use snapshot().
     * @returns {string}
     */
    report_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_report_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} building
     * @param {string} kind
     * @param {boolean} replant
     * @returns {boolean}
     */
    configure_crop(building, kind, replant) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.game_configure_crop(this.__wbg_ptr, building, ptr0, len0, replant);
        return ret !== 0;
    }
    /**
     * @param {number} resident
     * @param {number} building
     * @returns {string}
     */
    visit_building(resident, building) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_visit_building(this.__wbg_ptr, resident, building);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} kind
     * @param {number} x
     * @param {number} y
     * @param {string} variant
     * @returns {string}
     */
    place_with_recipe(kind, x, y, variant) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(variant, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.game_place_with_recipe(this.__wbg_ptr, ptr0, len0, x, y, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {string} response
     * @returns {string}
     */
    respond_situation(response) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(response, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_respond_situation(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} building
     * @param {boolean} enabled
     * @returns {boolean}
     */
    set_power_enabled(building, enabled) {
        const ret = wasm.game_set_power_enabled(this.__wbg_ptr, building, enabled);
        return ret !== 0;
    }
    /**
     * @param {boolean} enabled
     */
    set_tools_enabled(enabled) {
        wasm.game_set_tools_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * Only actual sleep and off-site work qualify, never a commute or walking to bed.
     * @returns {boolean}
     */
    fast_forward_ready() {
        const ret = wasm.game_fast_forward_ready(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} feed_hens
     * @param {boolean} use_eggs
     */
    set_food_preferences(feed_hens, use_eggs) {
        wasm.game_set_food_preferences(this.__wbg_ptr, feed_hens, use_eggs);
    }
    /**
     * @returns {string}
     */
    contribute_tool_library() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_contribute_tool_library(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    constructor() {
        const ret = wasm.game_new();
        this.__wbg_ptr = ret >>> 0;
        GameFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} seconds
     */
    tick(seconds) {
        wasm.game_tick(this.__wbg_ptr, seconds);
    }
    /**
     * @param {string} kind
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    place(kind, x, y) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_place(this.__wbg_ptr, ptr0, len0, x, y);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {string} task
     * @param {boolean} encourage
     * @returns {string}
     */
    request(id, task, encourage) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(task, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_request(this.__wbg_ptr, id, ptr0, len0, encourage);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} data
     * @returns {boolean}
     */
    restore(data) {
        const ptr0 = passStringToWasm0(data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.game_restore(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    snapshot() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.game_snapshot(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('solar_friends_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;

// Run after npm run build: node --test test/scoring.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager } = require('../dist/managers/RoomManager');

function setup() {
    const events = [];
    const user = id => ({ name: id, socket: {
        id, join() {}, leave() {},
        emit(event, value) { events.push({ id, event, value }); },
    } });
    const users = [user('first'), user('second')];
    const manager = new RoomManager({});
    manager.createRoom(...users);
    return { manager, users, events, roomId: manager.findRoomBySocketId('first').roomId };
}

test('live analysis reports processing and returns a room-scoped score', async () => {
    const { manager, events, roomId } = setup();
    manager.scoreAudioWithGroq = async () => ({ score: 7, review: 'Clear speech.' });
    await manager.runLiveScore('first', Buffer.from('audio'));
    assert.deepEqual(events.filter(e => e.event === 'score-status').map(e => e.value.state), ['processing', 'ready']);
    assert.deepEqual(events.find(e => e.event === 'live-score-update').value, { score: 7, review: 'Clear speech.', roomId });
});

test('silence returns to listening rather than leaving processing stuck', async () => {
    const { manager, events } = setup();
    manager.scoreAudioWithGroq = async () => null;
    await manager.runLiveScore('first', Buffer.from('audio'));
    assert.equal(events.at(-1).value.state, 'listening');
    assert.equal(manager.liveProcessing.get('first'), false);
});

test('API failure reports an error and permits the next analysis', async () => {
    const { manager, events } = setup();
    manager.scoreAudioWithGroq = async () => { throw new Error('Network failure'); };
    await manager.runLiveScore('first', Buffer.from('audio'));
    assert.equal(events.at(-1).value.state, 'error');
    assert.equal(manager.liveProcessing.get('first'), false);
});

test('late results from a previous room cannot update a new room', async () => {
    const { manager, users, events, roomId } = setup();
    let finish;
    manager.scoreAudioWithGroq = () => new Promise(resolve => { finish = resolve; });
    const pending = manager.runLiveScore('first', Buffer.from('audio'));
    void manager.deleteRoom(roomId);
    manager.createRoom(...users);
    finish({ score: 9, review: 'Old result' });
    await pending;
    assert.equal(events.filter(e => e.event === 'live-score-update').length, 0);
});

test('room cleanup completes before final analysis and preserves a new room', async () => {
    const { manager, users, events, roomId } = setup();
    manager.audioBuffers.set('first', [Buffer.from('audio')]);
    let fail;
    manager.scoreAudioWithGroq = () => new Promise((_, reject) => { fail = reject; });
    const ending = manager.deleteRoom(roomId);
    assert.equal(manager.findRoomBySocketId('first'), null);
    manager.createRoom(...users);
    const newRoomId = manager.findRoomBySocketId('first').roomId;
    fail(new Error('API unavailable'));
    await ending;
    assert.equal(manager.findRoomBySocketId('first').roomId, newRoomId);
    assert.equal(events.find(e => e.id === 'first' && e.event === 'final-score').value.roomId, roomId);
});

test('audio tagged with an old room is ignored', () => {
    const { manager } = setup();
    manager.onAudioChunk('first', Buffer.from('audio'), 'old-room');
    assert.equal(manager.audioBuffers.get('first').length, 0);
});

test('the default scoring model requests JSON and validates the returned score', async () => {
    const axios = require('axios');
    const originalPost = axios.post;
    const key = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_SCORING_MODEL;
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.GROQ_SCORING_MODEL;
    const requests = [];
    axios.post = async (url, body, config) => {
        requests.push({ url, body, config });
        return url.endsWith('/transcriptions')
            ? { data: { text: 'Hello, this is a complete sentence.' } }
            : { data: { choices: [{ message: { content: '{"score":7,"review":"Clear speech."}' } }] } };
    };
    try {
        const { manager } = setup();
        assert.equal((await manager.scoreAudioWithGroq(Buffer.from('audio'))).score, 7);
        assert.equal(requests[1].body.model, 'openai/gpt-oss-20b');
        assert.deepEqual(requests[1].body.response_format, { type: 'json_object' });
        assert.equal(requests[0].config.timeout, 15000);
        assert.equal(requests[1].config.timeout, 15000);
    } finally {
        axios.post = originalPost;
        if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key;
        if (model === undefined) delete process.env.GROQ_SCORING_MODEL; else process.env.GROQ_SCORING_MODEL = model;
    }
});

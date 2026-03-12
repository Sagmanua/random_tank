// --- CONFIGURATION ---
const API_KEY_WOT = "1c67a69b2758f598f6edab23ca7dbb7c";
const ABLY_API_KEY = "WguLAg.JTlfJA:jtoShjnXjy5CVng7TfOH6VlKFOjhtEcy-jzYbuqjWX4"; 
const REGION = "eu";
const BASE = `https://api.worldoftanks.${REGION}/wot`;

// --- ROOM LOGIC ---
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room')?.toUpperCase();

// If no room in URL, create a random 4-char ID
if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    window.history.replaceState({}, '', `?room=${roomId}`);
}

document.getElementById('room-display').innerText = roomId;

// --- INITIALIZE ABLY ---
const ably = new Ably.Realtime(ABLY_API_KEY);
const channel = ably.channels.get(`tank-roulette:${roomId}`);

const dashboard = document.getElementById('dashboard');
const spinBtn = document.getElementById('spin-all-btn');

// --- UI GENERATION ---
for (let i = 1; i <= 7; i++) {
    dashboard.innerHTML += `
        <div class="roulette-card" id="card-${i}">
            <input type="text" class="p-input" id="input-${i}" placeholder="Player ${i}" value="${i === 1 ? 'Sagmanchu' : ''}">
            <div class="window">
                <div class="marker"></div>
                <div id="strip-${i}" class="strip"></div>
            </div>
            <div class="result-label" id="result-${i}"></div>
        </div>
    `;
}

// --- ROOM ACTIONS ---
function joinRoom() {
    const newRoom = document.getElementById('join-input').value.trim().toUpperCase();
    if (newRoom && newRoom !== roomId) {
        // Redirect to the same page with the new room ID
        window.location.href = `?room=${newRoom}`;
    }
}

function copyRoomLink() {
    navigator.clipboard.writeText(window.location.href);
    alert("Invite link copied!");
}

// --- NETWORK HELPERS ---
async function fetchJson(url, params) {
    const urlObj = new URL(url);
    Object.keys(params).forEach(key => urlObj.searchParams.append(key, params[key]));
    const r = await fetch(urlObj);
    return await r.json();
}

// --- CORE SPIN LOGIC ---
async function spinRoulette(cardIndex, nickname, seed) {
    const strip = document.getElementById(`strip-${cardIndex}`);
    const resultLabel = document.getElementById(`result-${cardIndex}`);
    
    try {
        const acc = await fetchJson(`${BASE}/account/list/`, { application_id: API_KEY_WOT, search: nickname, limit: 1 });
        if (!acc.data?.length) throw new Error("Not found");
        const accId = acc.data[0].account_id;

        const tData = await fetchJson(`${BASE}/account/tanks/`, { application_id: API_KEY_WOT, account_id: accId });
        const tankIds = tData.data[accId].map(t => t.tank_id.toString());

        let tierX = [];
        const CHUNK = 50;
        for (let i = 0; i < tankIds.length; i += CHUNK) {
            const chunk = tankIds.slice(i, i + CHUNK);
            const d = await fetchJson(`${BASE}/encyclopedia/vehicles/`, { application_id: API_KEY_WOT, tank_id: chunk.join(",") });
            if (d.data) {
                Object.values(d.data).forEach(t => { if(t && t.tier === 10) tierX.push(t); });
            }
        }

        if (tierX.length === 0) throw new Error("No Tier X");

        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";
        strip.innerHTML = "";
        strip.offsetHeight; 

        const count = 60;
        const winnerIdx = count - 2;
        let html = "";
        let winningTankName = "";

        for(let i = 0; i < count; i++) {
            // Seeded index ensures everyone in the room sees the same tank
            const pseudoIdx = (seed + i) % tierX.length;
            const tank = tierX[pseudoIdx];
            html += `<div class="slot">${tank.name}</div>`;
            if (i === winnerIdx) winningTankName = tank.name;
        }

        strip.innerHTML = html;
        const finalY = -(winnerIdx * 50); 
        
        strip.style.transition = "transform 4s cubic-bezier(0.1, 0, 0.1, 1)";
        strip.style.transform = `translateY(${finalY}px)`;

        setTimeout(() => { resultLabel.innerText = winningTankName; }, 4000);

    } catch (e) {
        resultLabel.innerText = e.message;
        strip.innerHTML = `<div class="slot">---</div>`;
    }
}

// --- ABLY SUBSCRIPTION ---
channel.subscribe('spin-event', (message) => {
    spinBtn.disabled = true;
    const { names, seed } = message.data;

    names.forEach((name, index) => {
        const input = document.getElementById(`input-${index + 1}`);
        input.value = name;
        if (name) spinRoulette(index + 1, name, seed);
    });

    setTimeout(() => { spinBtn.disabled = false; }, 5000);
});

// --- BUTTON CLICK ---
spinBtn.addEventListener('click', () => {
    const names = Array.from(document.querySelectorAll('.p-input')).map(i => i.value.trim());
    const sharedSeed = Math.floor(Math.random() * 10000);
    
    channel.publish('spin-event', { 
        names: names,
        seed: sharedSeed
    });
});
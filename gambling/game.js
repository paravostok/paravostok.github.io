// --- 1. SUPABASE SETUP ---
const supabaseUrl = 'https://supabase.com/dashboard/project/dwillyqcwielbkrfjopp';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3aWxseXFjd2llbGJrcmZqb3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTYyNjIsImV4cCI6MjA5MjY5MjI2Mn0.Xwu1fWzotLDSWPy2i27BvRl9AsSP9S_Fv0ot6cAAcxU';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// --- 2. STATE VARIABLES ---
let currentUser = localStorage.getItem('paravostok_user');
let currentBalance = 0;
let marketData = {};

// --- 3. IDENTITY & LOGIN SYSTEM ---
async function checkAuth() {
    if (!currentUser) {
        document.getElementById('login-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden'; 
    } else {
        document.getElementById('login-modal').classList.add('hidden');
        document.body.style.overflow = 'auto';
        document.getElementById('user-display').innerText = 'Player: ' + currentUser;
        
        await loadPlayerData();
        await loadLeaderboard();
    }
}

async function loginUser() {
    const name = document.getElementById('username-input').value.trim();
    if (name) {
        localStorage.setItem('paravostok_user', name);
        currentUser = name;
        
        // Try to create the user in the database (fails silently if they already exist, which is perfect)
        await supabase.from('players').insert([{ username: name }]);
        
        location.reload(); // Refresh to load their data
    }
}

function logoutUser() {
    localStorage.removeItem('paravostok_user');
    location.reload();
}

// --- 4. CLOUD DATA LOADING ---
async function loadPlayerData() {
    const { data, error } = await supabase
        .from('players')
        .select('balance, active_bets')
        .eq('username', currentUser)
        .single();
        
    if (data) {
        currentBalance = data.balance;
        document.getElementById('balance').innerText = parseFloat(currentBalance).toFixed(2);
        renderActiveBets(data.active_bets || []);
    }
}

async function loadLeaderboard() {
    const { data, error } = await supabase
        .from('players')
        .select('username, balance')
        .order('balance', { ascending: false }); // Highest balance first!
        
    if (data) {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';
        data.forEach((player, index) => {
            list.innerHTML += `<li style="padding: 10px; background: #eee; margin-bottom: 5px; border-radius: 4px;">
                <strong>#${index + 1} ${player.username}</strong> - ${parseFloat(player.balance).toFixed(2)} Credits
            </li>`;
        });
    }
}

// --- 5. MARKET & BETTING LOGIC ---
async function loadMarket() {
    try {
        // Fetch the AI-generated markets from your data.json
        const response = await fetch('data.json');
        marketData = await response.json();
        
        const container = document.getElementById('market-container');
        container.innerHTML = ''; // Clear loading text
        
        marketData.current_events.forEach(event => {
            container.innerHTML += `
                <div class="event-card">
                    <h3>${event.title}</h3>
                    <p>${event.desc}</p>
                    <p>Payout: <span class="payout">${event.payout}x</span></p>
                    <input type="number" id="bet-amount-${event.id}" placeholder="Bet amount" style="width: 100px;">
                    <button onclick="placeBet('${event.id}', '${event.title}', ${event.payout})">Place Bet</button>
                </div>
            `;
        });
    } catch (e) {
        document.getElementById('market-container').innerHTML = '<p>Error loading market data. Has the AI run today?</p>';
    }
}

async function placeBet(eventId, eventTitle, payout) {
    const amountInput = document.getElementById(`bet-amount-${eventId}`);
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) {
        alert("Enter a valid bet amount!");
        return;
    }
    if (amount > currentBalance) {
        alert("You don't have enough credits!");
        return;
    }

    // 1. Fetch the user's latest data straight from the cloud to prevent cheating
    const { data: player } = await supabase.from('players').select('balance, active_bets').eq('username', currentUser).single();
    
    // 2. Calculate new balance and new bets list
    const newBalance = player.balance - amount;
    const newBet = { id: eventId, title: eventTitle, amount: amount, payout: payout, date: new Date().toISOString() };
    const updatedBets = [...(player.active_bets || []), newBet];

    // 3. Save to Supabase Cloud!
    const { error } = await supabase
        .from('players')
        .update({ balance: newBalance, active_bets: updatedBets })
        .eq('username', currentUser);

    if (!error) {
        amountInput.value = ''; // Clear input
        await loadPlayerData(); // Refresh UI
        await loadLeaderboard(); // Update leaderboard
        alert("Bet placed successfully!");
    } else {
        alert("Error placing bet. Try again.");
    }
}

function renderActiveBets(bets) {
    const list = document.getElementById('active-bets-list');
    list.innerHTML = '';
    
    if (bets.length === 0) {
        list.innerHTML = '<li>No active bets.</li>';
        return;
    }

    bets.forEach(bet => {
        list.innerHTML += `<li style="margin-bottom: 10px;">
            <strong>${bet.title}</strong><br>
            Bet: ${bet.amount} Credits | Potential Payout: ${(bet.amount * bet.payout).toFixed(2)}
        </li>`;
    });
}

// --- 6. START THE APP ---
checkAuth();
loadMarket();

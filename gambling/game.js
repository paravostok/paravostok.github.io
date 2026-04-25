// --- 1. SUPABASE SETUP ---
// FIXED: Changed dashboard URL to the actual API endpoint
const supabaseUrl = 'https://dwillyqcwielbkrfjopp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3aWxseXFjd2llbGJrcmZqb3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTYyNjIsImV4cCI6MjA5MjY5MjI2Mn0.Xwu1fWzotLDSWPy2i27BvRl9AsSP9S_Fv0ot6cAAcxU';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// --- 2. STATE VARIABLES ---
let currentUser = localStorage.getItem('paravostok_user');
let currentBalance = 0;
let marketData = {};

// --- 3. NOTIFICATION SYSTEM (NEW) ---
function showToast(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.className = "toast"; // Reset classes
    if (isError) toast.classList.add("error");
    toast.textContent = message;
    
    toast.classList.add("show");
    
    // Hide it after 3 seconds
    setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

// --- 4. IDENTITY & LOGIN SYSTEM ---
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
        
        // Try to create the user in the database (fails silently if they already exist)
        await supabaseClient.from('players').insert([{ username: name }]);
        
        location.reload(); // Refresh to load their data
    }
}

function logoutUser() {
    localStorage.removeItem('paravostok_user');
    location.reload();
}

// --- 5. CLOUD DATA LOADING ---
async function loadPlayerData() {
    const { data, error } = await supabaseClient
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
    const { data, error } = await supabaseClient
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

// --- 6. PAYOUT SYSTEM (NEW) ---
async function processPayouts() {
    if (!currentUser || !marketData.history) return;

    // 1. Fetch the user's latest data
    const { data: player } = await supabaseClient
        .from('players')
        .select('balance, active_bets')
        .eq('username', currentUser)
        .single();

    if (!player || !player.active_bets || player.active_bets.length === 0) return;

    let newBalance = parseFloat(player.balance);
    let remainingBets = [];
    let totalWinnings = 0;
    let betsResolved = 0;

    // 2. Check each active bet against the AI's resolved history
    player.active_bets.forEach(bet => {
        const resolvedEvent = marketData.history.find(event => event.id === bet.id);

        if (resolvedEvent) {
            betsResolved++;
            if (resolvedEvent.result === "WON") {
                const winnings = bet.amount * bet.payout;
                newBalance += winnings;
                totalWinnings += winnings;
            }
            // If it's LOST, we just don't add it to remainingBets
        } else {
            // Still pending! Keep it in their active list
            remainingBets.push(bet);
        }
    });

    // 3. If any bets finished, update the cloud and notify the player
    if (betsResolved > 0) {
        await supabaseClient
            .from('players')
            .update({ balance: newBalance, active_bets: remainingBets })
            .eq('username', currentUser);

        // Update the screen instantly
        currentBalance = newBalance;
        document.getElementById('balance').innerText = newBalance.toFixed(2);
        renderActiveBets(remainingBets);
        await loadLeaderboard(); 

        if (totalWinnings > 0) {
            showToast(`Market closed! You won ${totalWinnings.toFixed(2)} credits!`);
        } else {
            showToast(`Market closed. Your bets didn't happen this time.`, true);
        }
    }
}

// --- 7. MARKET & BETTING LOGIC ---
async function loadMarket() {
    try {
        const response = await fetch('data.json');
        marketData = await response.json();
        
        const container = document.getElementById('market-container');
        container.innerHTML = ''; 
        
        marketData.current_events.forEach(event => {
            // FIXED: We now ONLY pass the event.id to the placeBet function!
            // This prevents any weird punctuation in the title from breaking the button.
            container.innerHTML += `
                <div class="event-card">
                    <h3>${event.title}</h3>
                    <p>${event.desc}</p>
                    <p>Payout: <span class="payout">${event.payout}x</span></p>
                    <input type="number" class="bet-input" id="bet-amount-${event.id}" placeholder="Amount">
                    <button class="bet-button" onclick="placeBet('${event.id}')">Place Bet</button>
                </div>
            `;
        });

        await processPayouts();

    } catch (e) {
        document.getElementById('market-container').innerHTML = '<p>Error loading market data. Has the AI run today?</p>';
    }
}

async function placeBet(eventId) {
    const amountInput = document.getElementById(`bet-amount-${eventId}`);
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) {
        showToast("Enter a valid bet amount!", true);
        return;
    }
    if (amount > currentBalance) {
        showToast("You don't have enough credits!", true);
        return;
    }

    // FIXED: Safely look up the title and payout from our data using the ID
    const eventToBetOn = marketData.current_events.find(e => e.id === eventId);
    if (!eventToBetOn) {
        showToast("Error finding event data.", true);
        return;
    }

    const { data: player } = await supabaseClient.from('players').select('balance, active_bets').eq('username', currentUser).single();
    
    const newBalance = player.balance - amount;
    
    // Use the safely retrieved title and payout
    const newBet = { 
        id: eventId, 
        title: eventToBetOn.title, 
        amount: amount, 
        payout: eventToBetOn.payout, 
        date: new Date().toISOString() 
    };
    
    const updatedBets = [...(player.active_bets || []), newBet];

    const { error } = await supabaseClient
        .from('players')
        .update({ balance: newBalance, active_bets: updatedBets })
        .eq('username', currentUser);

    if (!error) {
        amountInput.value = ''; 
        await loadPlayerData(); 
        await loadLeaderboard(); 
        showToast("Bet placed successfully!");
    } else {
        showToast("Error placing bet. Try again.", true);
    }
}

// --- 8. START THE APP ---
checkAuth();
loadMarket();

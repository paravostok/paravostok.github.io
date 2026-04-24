async function checkBets() {
    const response = await fetch('results.json'); 
    const results = await response.json();
    
    let myBets = JSON.parse(localStorage.getItem('my_bets')) || [];
    
    myBets.forEach(bet => {
        if (results[bet.id] === "WIN") {
            let winnings = bet.amount * bet.payout;
            addCredits(winnings);
            alert(`You won ${winnings} on ${bet.title}!`);
        }
    });
}

/**
 * Regional STV + Best Loser Levelling System Engine
 */

// 1. Ensures sum of local seats equals localTotal (640) by balancing unassigned seats
function normalizeElectionData(rawData, targetLocalSeats = 640) {
  if (!rawData || !rawData.parties) return rawData;

  let parties = JSON.parse(JSON.stringify(rawData.parties)); // Deep copy
  let currentLocalSum = parties.reduce((acc, p) => acc + (p.localSeatsTotal || p.localSeats || 0), 0);

  // If total local seats sum to less than 640, aggregate remaining balance into "Others / Independents"
  if (currentLocalSum < targetLocalSeats) {
    const remainingSeats = targetLocalSeats - currentLocalSum;
    const currentVoteSum = parties.reduce((acc, p) => acc + (p.ukVotePct || 0), 0);
    const remainingVotePct = Math.max(0, parseFloat((100 - currentVoteSum).toFixed(2)));

    let others = parties.find(p => 
      p.name.toLowerCase().includes('other') || p.name.toLowerCase().includes('independent')
    );

    if (others) {
      others.localSeatsTotal = (others.localSeatsTotal || others.localSeats || 0) + remainingSeats;
      others.ukVotePct = parseFloat(((others.ukVotePct || 0) + remainingVotePct).toFixed(2));
    } else {
      parties.push({
        name: 'Others / Independents',
        ukVotePct: remainingVotePct,
        localSeatsTotal: remainingSeats,
        regionalData: {}
      });
    }
  }

  return {
    ...rawData,
    parties: parties
  };
}

// 2. Main Election Calculation Logic
function calculateElection(rawData, options = {}) {
  const localTotal = options.localSeatsTotal || 640;
  const poolCap = options.levellingCap || 60;
  const fairnessActive = options.fairnessRule !== false;

  // Balance local seats to 640
  const data = normalizeElectionData(rawData, localTotal);

  let totalDemand = 0;
  const partyResults = [];

  data.parties.forEach(party => {
    const localSeats = party.localSeatsTotal || party.localSeats || 0;
    const votePct = party.ukVotePct || 0;

    let qualifiesNational = false;
    let qualifiesRegional = false;
    let levellingNeeded = 0;

    // National Fair Share (calculated against localTotal = 640)
    const nationalFairShare = (votePct / 100) * localTotal;
    const nationalDeficitLimit = nationalFairShare * 0.80; // 20% deficit trigger
    const nationalDeficitPct = nationalFairShare > 0 ? (nationalFairShare - localSeats) / nationalFairShare : 0;

    // A. Check 5% UK Threshold (+ Fairness Rule at 4.5% if >=30% deficit)
    if (votePct >= 5.0) {
      qualifiesNational = true;
    } else if (fairnessActive && votePct >= 4.5 && nationalDeficitPct >= 0.30) {
      qualifiesNational = true;
    }

    if (qualifiesNational) {
      // Deficit applies at the Nationwide level
      if (localSeats <= nationalDeficitLimit) {
        levellingNeeded = Math.round(nationalFairShare - localSeats);
      }
    } else {
      // B. Check Regional Thresholds per region for parties missing 5% UK
      if (party.regionalData && data.regionalSeatTotals) {
        Object.keys(party.regionalData).forEach(region => {
          const regInfo = party.regionalData[region];
          const regTotalSeats = data.regionalSeatTotals[region] || 0;
          const regFairShare = (regInfo.votePct / 100) * regTotalSeats;
          const regDeficitLimit = regFairShare * 0.80;
          const regDeficitPct = regFairShare > 0 ? (regFairShare - regInfo.localSeats) / regFairShare : 0;

          let regQualifies = regInfo.votePct >= 12.0;
          if (!regQualifies && fairnessActive && regInfo.votePct >= 11.5 && regDeficitPct >= 0.30) {
            regQualifies = true;
          }

          if (regQualifies && regInfo.localSeats <= regDeficitLimit) {
            qualifiesRegional = true;
            levellingNeeded += Math.round(regFairShare - regInfo.localSeats);
          }
        });
      }
    }

    totalDemand += Math.max(0, levellingNeeded);

    partyResults.push({
      name: party.name,
      ukVotePct: votePct,
      localSeats: localSeats,
      fairShare: parseFloat(nationalFairShare.toFixed(1)),
      qualifies: qualifiesNational || qualifiesRegional,
      qualificationType: qualifiesNational ? 'National' : qualifiesRegional ? 'Regional' : 'None',
      levellingNeeded: Math.max(0, levellingNeeded),
      levellingAwarded: 0,
      totalSeats: localSeats
    });
  });

  // 3. Pool Allocation & Hard Cap Scaling (60 Max)
  let poolUsed = 0;
  partyResults.forEach(p => {
    if (p.qualifies && p.levellingNeeded > 0) {
      if (totalDemand <= poolCap) {
        p.levellingAwarded = p.levellingNeeded;
      } else {
        p.levellingAwarded = Math.floor((p.levellingNeeded / totalDemand) * poolCap);
      }
      poolUsed += p.levellingAwarded;
    }
    p.totalSeats = p.localSeats + p.levellingAwarded;
  });

  // Calculate sum of local seats across all parties
  const sumLocalSeatsAssigned = partyResults.reduce((acc, p) => acc + p.localSeats, 0);

  return {
    houseSize: sumLocalSeatsAssigned + poolUsed,
    localSeatsAssigned: sumLocalSeatsAssigned,
    poolUsed: poolUsed,
    poolCapacity: poolCap,
    parties: partyResults
  };
}

// 4. External Data Fetcher (Supports raw JSON URLs or Wikipedia API)
async function fetchElectionData(sourceUrlOrWikiPage) {
  // Option A: Wikipedia Page Scraper (e.g. "wikipedia:2017_United_Kingdom_general_election")
  if (sourceUrlOrWikiPage.startsWith('wikipedia:')) {
    const pageTitle = sourceUrlOrWikiPage.replace('wikipedia:', '');
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&origin=*`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('Wikipedia API fetch failed');
    const data = await response.json();
    return parseWikipediaElectionTable(data.parse.text['*']);
  } 
  
  // Option B: External Open JSON Repository / GitHub Raw File
  const response = await fetch(sourceUrlOrWikiPage);
  if (!response.ok) throw new Error(`HTTP fetch error: ${response.status}`);
  return await response.json();
}

// Basic parser for MediaWiki table output
function parseWikipediaElectionTable(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const tables = doc.querySelectorAll('table.wikitable');

  const parties = [];
  
  tables.forEach(table => {
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 4) {
        const textArr = Array.from(cells).map(c => c.textContent.trim().replace(/,/g, ''));
        const partyName = textArr[0] || textArr[1];
        
        // Find vote percentage cell (ends with %)
        const voteStr = textArr.find(t => t.endsWith('%'));
        const votePct = voteStr ? parseFloat(voteStr) : NaN;
        
        // Find seat count cell (integer)
        const seatStr = textArr.find(t => /^\d+$/.test(t));
        const seats = seatStr ? parseInt(seatStr) : 0;

        if (partyName && !isNaN(votePct) && votePct > 0) {
          parties.push({
            name: partyName,
            ukVotePct: votePct,
            localSeatsTotal: seats,
            regionalData: {}
          });
        }
      }
    });
  });

  return {
    election: "Wikipedia Fetched Election",
    regionalSeatTotals: { "Scotland": 58, "Wales": 38, "Northern Ireland": 18, "England": 526 },
    parties: parties
  };
}

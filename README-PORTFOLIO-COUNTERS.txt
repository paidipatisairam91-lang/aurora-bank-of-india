AURORA BANK — PORTFOLIO GRAPH, CITY COUNTS AND CUSTOMER DETAILS

- Dashboard home does not show the customer-count cards.
- Portfolio Graph is a separate tab. It displays starting customers (5,000), new signups,
  total customers, and a customer-growth bar graph.
- City-wise Customer Count is a separate graph inside Portfolio Graph. Hover over a city bar
  to view the city, state and registered-customer count.
- City-wise counts include customers registered through this demo. The historical 5,000
  starting customers are not allocated to cities because no city-level legacy data exists.
- Signup offers 10 demo branch cities: Vijayawada, Guntur, Mangalagiri, Visakhapatnam,
  Tirupati, Rajahmundry, Hyderabad, Bengaluru, Chennai and Mumbai.
- Selecting a city automatically fills the state and displays the matching branch name,
  branch address and IFSC. The selected branch details are saved with the new account.
- Customer Details is a separate tab and displays the signed-in user's profile and account data.

Run in VS Code:
  npm.cmd install
  npm.cmd start
Open http://localhost:3000

This is an academic demo; all Aurora Bank branch names, addresses and IFSC values are fictional.

PORTFOLIO DEMO DATA UPDATE
- Database contains 5,000 fictional sample customer records (DEMO00001–DEMO05000).
- Sample customers are distributed evenly across the 10 demo branch cities (500 each).
- Portfolio totals start at 5,000 and increase for each real signup on this demo website.
- City chart hover shows sample city count plus new signups for that city.
- These are fictional demonstration records, not real bank customers.

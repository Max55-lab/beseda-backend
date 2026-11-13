# Beseda Backend

Backend za Besedu (dijalektni rječnik): zajednički podaci, računi, uredništvo.

## Pokretanje

```powershell
cd beseda-backend
npm install
npm run seed     # ubaci 42 zavičajne riječi
npm start        # http://localhost:3002
```

## API

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Riječi**: `GET /api/words` (filter: `?status=approved|pending|all`, `?govor=`, `?q=`), `GET /api/words/:id`, `POST /api/words` (auth, status pending), `PATCH /api/words/:id/status` (urednik), `DELETE /api/words/:id`
- **Zbirke**: `GET/POST /api/collections`, `PATCH /api/collections/:id`
- **Stats**: `GET /api/stats`

## Uloge

- `govornik` — može dodavati riječi (status `pending`)
- `urednik` — može odobravati/odbijati (`PATCH .../status`). Prvi korisnik se promovira putem `POST /api/admin/promote` (kad nema urednika, bilo tko može promovirati).

## Baza

SQLite (`beseda.db`), tablice: `users`, `words`, `collections`, `recordings`. Koristi `node:sqlite` (Node 22+), bez native kompajliranja.

## Render free tier i `robots.txt`

Render besplatni web servis spava nakon 15 minuta bez prometa. Dok spava, Render automatski vraća `Disallow: /` na `/robots.txt` i **ne budi servis**. Googlebot to može zapamtiti do 24 h i blokirati cijelu domenu.

Zato `.github/workflows/keepalive.yml` svake 4 minute poziva `/api/health` i drži servis budnim. Workflow se pokreće na promjenu tog fajla, svakih sat vremena i ručno.

> **Kvota:** Render daje 750 besplatnih sati mjesečno po workspaceu. Jedan servis 24/7 troši ~730 h. Ako u istom workspaceu ima još free servisa, oba mogu biti suspendirana prije kraja mjeseca. Za produkciju je potreban plaćeni plan.
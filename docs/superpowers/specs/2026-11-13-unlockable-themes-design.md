# Unlock table themes by playing (US-148)

## Design

- Three locked themes beyond the four of US-087: Forest (win a first match), Ruby (win 10) and Gilded (play 25). Each has
  its own felt, rim, seat colour and card back (`--card-back-a/b`) and its swatch.
- Unlocks come from the goals ledger of US-113: a guest's ledger lives in the browser, a signed-in player's comes from their
  statistics, so an account keeps its unlocks without new server storage. Each unlock is also remembered on the device
  (`beelot.unlocked-themes`), so a theme is not lost if the ledger cannot be loaded. Nothing is bought and nothing changes play.
- A locked theme's radio is disabled and its label carries "Locked: <what unlocks it>", which a screen reader reads with the
  choice. A new unlock is announced in the game's live region. A stored choice of a theme that is not unlocked falls back to
  comic.
- The new themes are in the contrast test of the existing themes (ink, paper, gold, pink, aqua, violet, red on their
  backgrounds, and paper on the seat colour).

## Not verified

No browser check of the swatches or the card backs; the contrast is checked by the existing computed test.

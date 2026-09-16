# Clean up Drills, Challenges, and Training Plans navigation

## Changes
- Remove the Training Plans and Challenges shortcut cards from the Drill Library, leaving its existing drills and actions unchanged.
- Replace the Dashboard training summary with one compact, secondary card:
  - No active program: explain Tournament and coach programs and link to the existing Training Plans page.
  - Active program: show the most relevant program, real completion/countdown data, its next session, a continue action, and a separate route to all plans.
  - Multiple active programs: choose one current summary rather than rendering multiple full cards.
- Keep the five-item bottom navigation, Challenges page, canonical Training Plans pages, and activity launch paths unchanged.

## Verification
- Check Drills, Challenges, Dashboard, Training Plans, tournament creation, coach programs, and activity launching.
- Check standard and Tweed Ospreys managed themes on mobile, tablet, and desktop, including horizontal overflow.
- Run focused automated checks and report any acceptance item that cannot be exercised without changing real user data.

## Technical details
- Limit edits to presentation/navigation files; do not change program, drill, challenge, BSI, timing, Weekly Practice, permissions, tournament, authentication, or native-build logic.
- Use existing canonical program queries and progress data; no duplicate program or activity logic.

"""The built-in BJJ technique library, loaded into the `technique` table at startup.

Each technique has:
  - category: what it is   -> submission | pass | sweep | escape | takedown | position
  - position: where you are when you do it -> standing | top | bottom
    (back control counts as "top": you're the one in control)

Add techniques by adding lines here; they're inserted the next time the API starts.
Renaming one here adds a new row (the old name stays, so old session logs still make sense).
Users can also add their own techniques while logging a session.
"""

# (name, category, position)
TECHNIQUES: list[tuple[str, str, str]] = [
    # --- Submissions ---------------------------------------------------------
    ("Rear naked choke", "submission", "top"),
    ("Bow and arrow choke", "submission", "top"),
    ("Armbar from mount", "submission", "top"),
    ("Armbar from guard", "submission", "bottom"),
    ("Armbar from side control", "submission", "top"),
    ("Triangle choke", "submission", "bottom"),
    ("Mounted triangle", "submission", "top"),
    ("Kimura from guard", "submission", "bottom"),
    ("Kimura from top", "submission", "top"),
    ("Americana", "submission", "top"),
    ("Guillotine from guard", "submission", "bottom"),
    ("Standing guillotine", "submission", "standing"),
    ("Arm-in guillotine", "submission", "standing"),
    ("D'Arce choke", "submission", "top"),
    ("Anaconda choke", "submission", "top"),
    ("Arm triangle", "submission", "top"),
    ("Ezekiel choke", "submission", "top"),
    ("Cross collar choke from guard", "submission", "bottom"),
    ("Cross collar choke from mount", "submission", "top"),
    ("Loop choke", "submission", "top"),
    ("Baseball bat choke", "submission", "top"),
    ("Clock choke", "submission", "top"),
    ("North-south choke", "submission", "top"),
    ("Paper cutter choke", "submission", "top"),
    ("Omoplata", "submission", "bottom"),
    ("Gogoplata", "submission", "bottom"),
    ("Straight ankle lock", "submission", "bottom"),
    ("Heel hook", "submission", "bottom"),
    ("Kneebar", "submission", "bottom"),
    ("Toe hold", "submission", "bottom"),
    ("Calf slicer", "submission", "top"),
    ("Wrist lock", "submission", "top"),
    ("Flying armbar", "submission", "standing"),
    ("Flying triangle", "submission", "standing"),
    # --- Guard passes --------------------------------------------------------
    ("Toreando pass", "pass", "top"),
    ("Knee slice", "pass", "top"),
    ("Over-under pass", "pass", "top"),
    ("Double under pass", "pass", "top"),
    ("Leg drag", "pass", "top"),
    ("Stack pass", "pass", "top"),
    ("Long step", "pass", "top"),
    ("X-pass", "pass", "top"),
    ("Smash pass", "pass", "top"),
    ("Body lock pass", "pass", "top"),
    ("Headquarters pass", "pass", "top"),
    ("Leg weave", "pass", "top"),
    # --- Sweeps --------------------------------------------------------------
    ("Scissor sweep", "sweep", "bottom"),
    ("Hip bump sweep", "sweep", "bottom"),
    ("Flower sweep", "sweep", "bottom"),
    ("Butterfly sweep", "sweep", "bottom"),
    ("Tripod sweep", "sweep", "bottom"),
    ("Sickle sweep", "sweep", "bottom"),
    ("De La Riva sweep", "sweep", "bottom"),
    ("Berimbolo", "sweep", "bottom"),
    ("X-guard sweep", "sweep", "bottom"),
    ("Single leg X sweep", "sweep", "bottom"),
    ("Waiter sweep", "sweep", "bottom"),
    ("Elevator sweep", "sweep", "bottom"),
    ("Old school sweep", "sweep", "bottom"),
    ("Pendulum sweep", "sweep", "bottom"),
    # --- Escapes -------------------------------------------------------------
    ("Mount escape (bridge and roll)", "escape", "bottom"),
    ("Mount escape (elbow-knee)", "escape", "bottom"),
    ("Side control escape to guard", "escape", "bottom"),
    ("Side control escape to knees", "escape", "bottom"),
    ("Back escape", "escape", "bottom"),
    ("Kesa gatame escape", "escape", "bottom"),
    ("North-south escape", "escape", "bottom"),
    ("Knee on belly escape", "escape", "bottom"),
    ("Armbar escape", "escape", "bottom"),
    ("Triangle escape", "escape", "top"),
    ("Guillotine escape", "escape", "top"),
    ("Leg lock escape", "escape", "top"),
    # --- Takedowns -----------------------------------------------------------
    ("Double leg", "takedown", "standing"),
    ("Single leg", "takedown", "standing"),
    ("Ankle pick", "takedown", "standing"),
    ("Osoto gari", "takedown", "standing"),
    ("Ouchi gari", "takedown", "standing"),
    ("Kouchi gari", "takedown", "standing"),
    ("Seoi nage", "takedown", "standing"),
    ("Uchi mata", "takedown", "standing"),
    ("Foot sweep", "takedown", "standing"),
    ("Arm drag", "takedown", "standing"),
    ("Snap down", "takedown", "standing"),
    ("Guard pull", "takedown", "standing"),
    # --- Positions gained ----------------------------------------------------
    ("Took the back", "position", "top"),
    ("Got mount", "position", "top"),
    ("Knee on belly", "position", "top"),
    ("Side control", "position", "top"),
    ("Back take from guard", "position", "bottom"),
    ("Came up on a single leg", "position", "bottom"),
    ("Recovered guard", "position", "bottom"),
]

CATEGORIES = ("submission", "pass", "sweep", "escape", "takedown", "position")
POSITIONS = ("standing", "top", "bottom")

# Model notes

## Race Rewind

Driver names, race identity, grid and finishing positions, lap times, lap positions and recorded pit-stop laps come from Jolpica. The app picks a recorded stop with enough surrounding clean-lap data. The **recorded** card gives that driver's actual position at the comparison lap and separately states their actual finishing position.

The **conditional** card moves that stop at most five laps earlier or later. It estimates the time difference as:

`moved laps × (median clean-lap pace before the stop − median clean-lap pace after the stop)`

It then adds that difference to the driver's recorded cumulative time at a **fixed comparison lap**, eight laps after the recorded stop, and ranks that time against the other drivers' recorded times at that lap. The same comparison lap is used when the slider moves. A simple sensitivity check changes the pace difference by ±0.25 seconds per moved lap. This is an illustrative, local calculation, **not** a calibrated probability or revised official result.

The model assumes the pit-lane loss stays the same when moved, every other driver follows their recorded race, and the nearby pace remains representative. It does not know tyre compounds, traffic, safety-car or red-flag phases, fuel effects or whether a tyre allocation would allow the alternative. Large pace discontinuities above 2.5 seconds per lap are excluded from the available stop choices. A small pace difference can still move several positions in a tightly packed field; this should be read as a scenario, not a prediction of what would have happened.

## Strategy Lab

The replay starts from recorded lap positions and lap times. Its displayed gap is derived from cumulative times at the same completed lap. The two choices use the same rival and future-lap horizon. “Pit now” stops on the next simulated lap. “Stay out X laps” stops after X further laps. The selected pit loss, fresh-tyre gain and degradation values are model inputs, not confirmed historical facts for that driver.

The sensitivity range varies pit loss by ±2.5 seconds and fresh-tyre gain by ±0.25 seconds per lap; it is **not** a confidence interval. The model pauses for safety car, VSC, rain or red flag when the viewer selects one in manual mode. In historical replay, race-control status is not available from the bundled source, so the user must treat the result as a green-flag scenario rather than a reconstruction of every condition.

## Form watch

The pre-race podium display uses real standings and the last completed race result. It assigns 70% weight to points normalized against the season leader and 30% to the driver's finishing place in the last completed race. It does not include upcoming qualifying, weather, tyre choice or track-specific performance. Its three names are illustrative form picks, **not** odds or a validated prediction model.

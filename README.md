# shuttle-tracker
Simple webpage for tracking the  MIT shuttles and some MBTA buses. Easily extend with more agencies and routes. No predictions, just positions.

http://people.csail.mit.edu/jasongao/shuttle/index.html

Customize agencies and routes shown by adding GET parameters to the URL, with agencies as keys and routes as values. Note that a key with an empty value means "all routes" for that agency. For example:

http://people.csail.mit.edu/jasongao/shuttle/index.html?mit=&mbta=1&mbta=47

Show stops on each route by adding a `showStops` key to the GET parameters. I think it adds too much clutter, though, which is why it's off by default. For example:

http://people.csail.mit.edu/jasongao/shuttle/index.html?mit=&mbta=1&mbta=47&showStops=whatever


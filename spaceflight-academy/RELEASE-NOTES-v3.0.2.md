# Spaceflight Academy v3.0.2 · Private Blueprint Studio

## Changed

* The **Blueprint Studio** no longer appears on the public site. Production builds leave out
  its Spaceport building and door ring, the hub menu button, the Studio screen, the View
  Detective card in the Training Center, the "blueprints read" counter and the two Studio
  achievements (Blueprint Reader, View Detective). It still works when you run `npm run dev`
  on your own computer.
* The portal manifest no longer lists the Blueprint Studio as a feature.
* The Crew Lounge badge count only counts achievements that are shown.

## Unchanged

Learning rules, questions, missions, rockets, saves (Studio progress already saved is kept),
the Classic edition, port 8119 and the health check. The blueprint specs still build every 3D
model, and the Blueprint Book generator in `tools/blueprint-book` is not served.

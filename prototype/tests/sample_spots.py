"""Gives a browser test the 26 old example spots (sample_spots.js) as known data.
The live site has no built-in spots any more, so tests that click on spots like
s1 or s4 call use_sample_spots(page) before page.goto().
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_EMPTY = 'const SPOTS = [];'


def use_sample_spots(page):
    with open(os.path.join(_HERE, 'sample_spots.js'), encoding='utf-8') as f:
        spots = f.read()

    def handle(route):
        body = route.fetch().text()
        assert _EMPTY in body, 'js/data.js no longer has the empty SPOTS line'
        route.fulfill(body=body.replace(_EMPTY, spots), content_type='application/javascript')

    page.route('**/js/data.js', handle)

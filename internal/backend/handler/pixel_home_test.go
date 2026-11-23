package handler

import "testing"

func TestValidatePixelFurniture(t *testing.T) {
	valid := []pixelFurniture{
		{Kind: "desk", X: 4, Y: 8},
		{Kind: "chair", X: 11, Y: 9},
		{Kind: "plant", X: 30, Y: 18},
		{Kind: "shelf", X: 20, Y: 13},
	}
	if !validatePixelFurniture(valid) || !validatePixelFurniture(nil) {
		t.Fatal("valid furniture or empty room rejected")
	}
	tests := map[string][]pixelFurniture{
		"unknown type": {{Kind: "free-wall", X: 4, Y: 8}},
		"negative": {{Kind: "chair", X: -1, Y: 8}},
		"past edge": {{Kind: "desk", X: 33, Y: 8}},
		"blocked entry": {{Kind: "desk", X: 15, Y: 21}},
		"overlap": {{Kind: "desk", X: 8, Y: 10}, {Kind: "chair", X: 9, Y: 11}},
	}
	for label, furniture := range tests {
		if validatePixelFurniture(furniture) {
			t.Errorf("%s was not rejected", label)
		}
	}
	tooMany := make([]pixelFurniture, 25)
	for i := range tooMany {
		tooMany[i] = pixelFurniture{Kind: "chair", X: 2 + i%13*2, Y: 8 + i/13*2}
	}
	if validatePixelFurniture(tooMany) {
		t.Fatal("more than 24 furniture must be rejected")
	}
}

func TestPixelFurnitureAcceptsOnlyKnownKinds(t *testing.T) {
	for _, kind := range []string{"desk", "chair", "plant", "lamp", "shelf"} {
		if !validatePixelFurniture([]pixelFurniture{{Kind: kind, X: 6, Y: 12}}) {
			t.Errorf("known furniture type %q rejected", kind)
		}
	}
}

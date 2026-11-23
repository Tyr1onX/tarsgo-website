package handler

import "testing"

func TestValidPixelFurniture(t *testing.T) {
 tests := []struct {name string; items []PixelFurniture; ok bool}{
  {"empty", nil, true},
  {"one item", []PixelFurniture{{Kind:"desk",X:4,Y:7,Rotation:0}},true},
  {"invalid furniture", []PixelFurniture{{Kind:"script",X:4,Y:7}},false},
  {"outside room", []PixelFurniture{{Kind:"chair",X:19,Y:7}},false},
  {"doorway blocked", []PixelFurniture{{Kind:"chair",X:10,Y:13}},false},
  {"duplicate cell", []PixelFurniture{{Kind:"chair",X:3,Y:6},{Kind:"lamp",X:3,Y:6}},false},
  {"invalid orientation", []PixelFurniture{{Kind:"lamp",X:4,Y:7,Rotation:9}},false},
 }
 for _,tt:=range tests {
  t.Run(tt.name,func(t *testing.T){
   if got:=validPixelFurniture(tt.items);got!=tt.ok { t.Fatalf("validPixelFurniture()=%t, want %t",got,tt.ok) }
  })
 }
 items:=make([]PixelFurniture,25)
 for i:=range items { items[i]=PixelFurniture{Kind:"chair",X:2+i%16,Y:5+i/16} }
 if validPixelFurniture(items) { t.Fatal("more than 24 furniture must be rejected") }
}

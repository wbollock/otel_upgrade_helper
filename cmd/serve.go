package main

import (
	"log"
	"net/http"
)

func main() {
	fs := http.FileServer(http.Dir("docs"))
	http.Handle("/", fs)
	log.Println("Serving docs/ at http://localhost:8080 ...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

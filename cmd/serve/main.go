package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()
	fs := http.FileServer(http.Dir("docs"))
	http.Handle("/", fs)
	log.Printf("Serving docs/ at http://localhost%s ...", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}

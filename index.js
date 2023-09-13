const http = require('http');
// ovo je modul koristi express za create server, ali nama je potrebna ta server instanca
// za pokretanje web socketa i socket.io
const express = require('express');
const socketio = require('socket.io');

const app = express();
const PORT = 3000 || process.env.PORT;

const server = http.createServer(app);
const io = socketio(server);

//Run when a client connects

io.on('connection',(socket)=>{
    console.log('New WS Connection...');
    // add a new player and expand cards list
    socket.emit('message', 'Welcome to the session!');
    // ova linija iznad ce se emitovati klijentu koji se tek povezao

    socket.broadcast.emit('message', 'A player joined!');
    // ova linija iznad ce se emitovati svim postojecim klijentima koji su povezani osim trenutnog
    // io.emit() je za broadcastovanje svim klijentima

    //Runs when client disconnects
    socket.on('disconnect',()=>{
        io.emit('message','A player has left the game.');
    })
});

io.on('cardSelect',()=>{
    console.log('Selected a card');
    // update card selected by a player
});

io.on('cardVote',()=>{
    console.log('Voted for card');
    // update card voted by a player
})

io.on('scoreUpdate',()=>{
    console.log('Current score is..');
    // update scores of each player
})

server.listen(PORT, ()=>{
    console.log(`Server runnning on port: ${PORT}`);
});


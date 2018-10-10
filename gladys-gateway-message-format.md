# Gladys Gateway API

## Healthcheck

`GET /ping`

```json
{
	"status": 200
}
```

## User


### User creation

`POST /users`

```json
{
	"email": "",
	"password": ""
}
```

### Confirm email

`POST /users/verify/`



### Get myself

`GET /me`

```json
{
	"two_factor_enabled": ""
}
```

### PATCH user

`PATCH /me`

```json
{
	"name":""
}
```


### Login

`POST /login`


```json
{
	"password": "...",
	"scopes": [
		"dashboard:read",
		"dashboard:write",
		"instance:read",
		"instance:write"
	]
}
```

Return two factor token

`POST /login_two_factor`

Send two factor code


### Forgot password request


`POST /users/forgot_password`

```json
{
	"email": ""
}
```

### Reset password

`POST /users/reset_password`

```json
{
	"token": "",
	"password": ""
}
```

### Enable 2FA

`POST /setup_two_factor`

```json
{
	"two_factor_secret": ""
}
```

`POST /verify_two_factor`

```json
{
	"two_factor_code":""
}
```

Enabled!

### Get users

`GET /users`

```json
[
	{
		"id": "",
		"name": "",
		"gladys_user_id": 1
	}
]
```


### Invite other user in account

`POST /users/invite`

```json
{
	"email": ""
}
```

## Key

### User Key declaration

`POST /users/keys`

```json
{
	"public_key": {},
	"encrypted_private_key": {}
}
```

### Get instance

`GET /instances`


## Instance


### Instance key declaration

`POST /instances/keys`

```json
{
	"public_key": {}
}
```



### Calling a Gladys function

#### Function call

`.emit('message', body)`

Clear Text Body:

```json
{
	"version": "1.0",
	"timestamp": 198219809,
	"type": "gladys-function-call",
	"func": "deviceType.getByRoom",
	"params": [{
		
	}]
}
```

Encrypted Body:

```json
{
	"wrappedKey": "...", // the AES key encrypted with publicKey of the recipient
	"counter": [] // counter used in AES
	"data": "..." // the actual data,
	"instance_id": "..." 
}
```


Encrypted Response:

```json
{
	"wrappedKey": "...", // the AES key encrypted with publicKey of the recipient
	"counter": [] // counter used in AES
	"data": "..." // the actual data
}
```

Decrypted Response:

```json
{
	"version": "1.0",
	"timestamp": 198219809,
	"type": "gladys-function-response",
	"status": "resolved", // "rejected"
	"response": {
		
	}
}
```

#### Gladys API call

`.emit('message', body)`

Clear Text Body:

```json
{
	"version": "1.0",
	"timestamp": 198219809,
	"type": "gladys-api-call",
	"options": {
		"url": "/device",
		"method": "GET",
		"query": {
			"take": 10,
			"skip": 0
		}
	}
}
```


Decrypted Response:

```json
{
	"version": "1.0",
	"timestamp": 198219809,
	"type": "gladys-api-response",
	"status": "resolved", // "rejected"
	"response": {
		
	}
}	
```

###Receiving a Websocket event

`.on('event')`

decrypted

```json
{
	"version": "1.0",
	"timestamp": 198219809,
	"type": "gladys-websocket-event",
	"event": "newDeviceState",
	"data": {
		
	}
}
```

## API from Gateway to Gladys

### .on('message')

```json
{
	"wrappedKey": "...", // the AES key encrypted with publicKey of the recipient
	"counter": [] // counter used in AES
	"data": "..." // the actual data,
	"user_id": "...",
	"gladys_user_id": "..."
}
```

### .send('event')

```json
{
	"wrappedKey": "...", // the AES key encrypted with publicKey of the recipient
	"counter": [] // counter used in AES
	"data": "..." // the actual data,
	"user_id": "..."
}
```

### .on('user-id-matching')

body:

```json
{
	"id": "",
	"email": ""
}
```

response

```json
{
	"gladys_user_id": 1
}
```


# PaperFlow User Service API

- API Version: v1
- Generated At: 2026-03-19T14:49:57.0190422+08:00

## Endpoints

| Method | Path | Controller#Method |
|---|---|---|
| GET | /api/v1/admin/users | AdminUsersController#list |
| GET | /api/v1/admin/users/{userId} | AdminUsersController#get |
| PATCH | /api/v1/admin/users/{userId} | AdminUsersController#update |
| POST | /api/v1/admin/users/{userId}/revoke-tokens | AdminUsersController#revokeTokens |
| POST | /api/v1/auth/login | AuthController#login |
| POST | /api/v1/auth/logout | AuthController#logout |
| POST | /api/v1/auth/password/confirm | AuthController#confirmPasswordReset |
| POST | /api/v1/auth/password/request | AuthController#requestPasswordReset |
| POST | /api/v1/auth/refresh | AuthController#refresh |
| POST | /api/v1/auth/register | AuthController#register |
| POST | /api/v1/auth/register/email-code/request | AuthController#requestRegisterEmailCode |
| GET | /api/v1/oauth/qq/authorize | QqOauthController#authorizeForBind |
| GET | /api/v1/oauth/qq/callback | QqOauthController#callback |
| GET | /api/v1/oauth/wechat/authorize | WechatOauthController#authorizeForBind |
| GET | /api/v1/oauth/wechat/callback | WechatOauthController#callback |
| GET | /api/v1/users/me | UsersController#me |
| PATCH | /api/v1/users/me | UsersController#updateMe |
| GET | /api/v1/users/me/bind | UserBindingsController#status |
| POST | /api/v1/users/me/bind/email/confirm | UserBindingsController#confirmEmail |
| POST | /api/v1/users/me/bind/email/request | UserBindingsController#requestEmail |
| POST | /api/v1/users/me/bind/phone/confirm | UserBindingsController#confirmPhone |
| POST | /api/v1/users/me/bind/phone/request | UserBindingsController#requestPhone |

## AdminUsersController

### GET /api/v1/admin/users

- Handler: AdminUsersController#list
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| query | q | `String` | false |
| query | status | `String` | false |
| query | role | `String` | false |
| query | page[number] | `int` | false |
| query | page[size] | `int` | false |

### GET /api/v1/admin/users/{userId}

- Handler: AdminUsersController#get
- Response: `Envelope<AdminUserResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| path | userId | `String` | true |

### PATCH /api/v1/admin/users/{userId}

- Handler: AdminUsersController#update
- Request Body: `UpdateUserRequest`
- Response: `Envelope<AdminUserResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| path | userId | `String` | true |

### POST /api/v1/admin/users/{userId}/revoke-tokens

- Handler: AdminUsersController#revokeTokens
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Roles | `String` | false |
| path | userId | `String` | true |

## AuthController

### POST /api/v1/auth/login

- Handler: AuthController#login
- Request Body: `LoginRequest`
- Response: `Envelope<AuthResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-Forwarded-Proto | `String` | false |

### POST /api/v1/auth/logout

- Handler: AuthController#logout
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |
| header | X-Forwarded-Proto | `String` | false |

### POST /api/v1/auth/password/confirm

- Handler: AuthController#confirmPasswordReset
- Request Body: `PasswordResetConfirmRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |

### POST /api/v1/auth/password/request

- Handler: AuthController#requestPasswordReset
- Request Body: `PasswordResetRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |

### POST /api/v1/auth/refresh

- Handler: AuthController#refresh
- Response: `Envelope<AuthResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-Forwarded-Proto | `String` | false |

### POST /api/v1/auth/register

- Handler: AuthController#register
- Request Body: `RegisterRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |

### POST /api/v1/auth/register/email-code/request

- Handler: AuthController#requestRegisterEmailCode
- Request Body: `RequestEmailCodeRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |

## QqOauthController

### GET /api/v1/oauth/qq/authorize

- Handler: QqOauthController#authorizeForBind
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### GET /api/v1/oauth/qq/callback

- Handler: QqOauthController#callback
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| query | code | `String` | true |
| query | state | `String` | true |
| query | nickname | `String` | false |

## WechatOauthController

### GET /api/v1/oauth/wechat/authorize

- Handler: WechatOauthController#authorizeForBind
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### GET /api/v1/oauth/wechat/callback

- Handler: WechatOauthController#callback
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| query | code | `String` | true |
| query | state | `String` | true |
| query | nickname | `String` | false |

## UsersController

### GET /api/v1/users/me

- Handler: UsersController#me
- Response: `Envelope<UserProfileResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### PATCH /api/v1/users/me

- Handler: UsersController#updateMe
- Request Body: `UpdateProfileRequest`
- Response: `Envelope<UserProfileResponse>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

## UserBindingsController

### GET /api/v1/users/me/bind

- Handler: UserBindingsController#status
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### POST /api/v1/users/me/bind/email/confirm

- Handler: UserBindingsController#confirmEmail
- Request Body: `ConfirmCodeRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### POST /api/v1/users/me/bind/email/request

- Handler: UserBindingsController#requestEmail
- Request Body: `BindEmailRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### POST /api/v1/users/me/bind/phone/confirm

- Handler: UserBindingsController#confirmPhone
- Request Body: `ConfirmCodeRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |

### POST /api/v1/users/me/bind/phone/request

- Handler: UserBindingsController#requestPhone
- Request Body: `BindPhoneRequest`
- Response: `Envelope<Object>`

| In | Name | Type | Required |
|---|---|---|---|
| header | X-Request-Id | `String` | false |
| header | X-User-Id | `String` | false |


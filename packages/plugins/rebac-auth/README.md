
Rebac Auth
==========

Levels of Access:

* Direct field read/write, i.e. user can see exactly the value of `user.email`
* Indirect field read/write, i.e. user can see value of `user.fullName`, not `user.firstName` directly
  * Only "controlled code" (async properties, reactive fields, etc. are allowed this indirect access) 
* ...internal?...like Joist itself setting defaults?


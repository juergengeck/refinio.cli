$invite = Get-Content C:\OneFiler\invites\iop_invite.txt
node dist/cli.js invite-connect $invite --api-url http://localhost:8082 --verbose
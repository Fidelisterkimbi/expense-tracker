output "instance_id" {
  description = "Expense Tracker EC2 instance ID"
  value       = aws_instance.expense_tracker.id
}

output "public_ip" {
  description = "Public IPv4 address of the Expense Tracker server"
  value       = aws_instance.expense_tracker.public_ip
}

output "public_dns" {
  description = "Public DNS hostname of the Expense Tracker server"
  value       = aws_instance.expense_tracker.public_dns
}

output "application_url" {
  description = "Expense Tracker application URL"
  value       = "http://${aws_instance.expense_tracker.public_ip}"
}

output "ssh_command" {
  description = "SSH command for connecting to the server"
  value       = "ssh ubuntu@${aws_instance.expense_tracker.public_ip}"
}

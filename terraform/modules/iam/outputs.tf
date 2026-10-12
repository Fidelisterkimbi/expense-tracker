output "cluster_role_arn" {
  value = aws_iam_role.eks_cluster.arn
}

output "node_role_arn" {
  value = aws_iam_role.eks_nodes.arn
}

output "cluster_policy_attachment_id" {
  value = aws_iam_role_policy_attachment.eks_cluster.id
}

output "node_policy_attachment_ids" {
  value = [
    aws_iam_role_policy_attachment.worker.id,
    aws_iam_role_policy_attachment.registry.id,
    aws_iam_role_policy_attachment.cni.id
  ]
}

output "ebs_csi_role_arn" {
  description = "IAM role ARN for the EBS CSI driver Pod Identity"
  value       = aws_iam_role.ebs_csi.arn
}

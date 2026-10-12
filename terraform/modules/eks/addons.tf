resource "aws_eks_addon" "vpc_cni" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "vpc-cni"
  addon_version = "v1.22.4-eksbuild.3"

}

resource "aws_eks_addon" "coredns" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "coredns"
  addon_version = "v1.14.7-eksbuild.10"

  depends_on = [aws_eks_node_group.workers]

}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "kube-proxy"
  addon_version = "v1.36.0-eksbuild.25"

  depends_on = [aws_eks_node_group.workers]
}

resource "aws_eks_addon" "eks_pod_identity_agent" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "eks-pod-identity-agent"
  addon_version = "v1.3.10-eksbuild.3"

  depends_on = [aws_eks_node_group.workers]
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "aws-ebs-csi-driver"
  addon_version = "v1.66.0-eksbuild.1"

  pod_identity_association {
    role_arn        = var.ebs_csi_role_arn
    service_account = "ebs-csi-controller-sa"
  }

  depends_on = [
    aws_eks_addon.eks_pod_identity_agent
  ]
}

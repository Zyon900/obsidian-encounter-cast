interface KickedScreenProps {
	message: string;
}

export function KickedScreen({ message }: KickedScreenProps) {
	return (
		<div className="shutdown-screen">
			<div className="shutdown-card">
				<h2>Removed from encounter</h2>
				<p>{message}</p>
			</div>
		</div>
	);
}
